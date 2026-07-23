import json
import os
import re
import uuid
from typing import Optional

import pandas as pd
import pingouin as pg
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client

from detection import DETECTION_ALGORITHMS, detect_droplets, render_hand_count_image
from imaging import (
    crop_array_percent,
    encode_png,
    encode_png_16,
    load_tif_plane,
    normalize_to_uint16,
    render_tif_to_image,
)

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SECRET_KEY"]
)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your GitHub Pages URL later
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "ok"}


# ---- Auth ----
# The frontend never talks to Supabase directly (per CLAUDE.md); it POSTs
# credentials here and gets back the Supabase Auth JWT to use as a bearer
# token on every later request.

class LoginBody(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def login(body: LoginBody):
    try:
        result = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not result or not result.session:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": result.session.access_token}


class SignupBody(BaseModel):
    email: str
    password: str


@app.post("/auth/signup")
def signup(body: SignupBody):
    try:
        result = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    # If email confirmation is disabled in the Supabase project, sign_up
    # returns a session immediately; otherwise the user must confirm by
    # email first and result.session is None.
    if result and result.session:
        return {"token": result.session.access_token}
    return {"message": "Check your email to confirm your account."}


class ResetPasswordBody(BaseModel):
    email: str


@app.post("/auth/reset-password")
def reset_password(body: ResetPasswordBody):
    try:
        supabase.auth.reset_password_for_email(body.email)
    except Exception as e:
        # Don't leak whether the email is registered to the client, but log
        # server-side so delivery failures (bad SMTP config, redirect URL
        # not in the allow list, rate limit) are actually visible somewhere.
        print(f"reset_password_for_email failed for {body.email}: {e}")
    return {"message": "If that email has an account, a reset link is on its way."}


def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization[len("Bearer "):]
    try:
        result = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not result or not result.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return result.user


class UpdatePasswordBody(BaseModel):
    password: str


@app.post("/auth/update-password")
def update_password(body: UpdatePasswordBody, user=Depends(get_current_user)):
    # get_current_user validates the bearer token (the recovery link's
    # access_token) via supabase.auth.get_user, then this uses the
    # service-role client to set the password by user id directly, since a
    # recovery token's session isn't otherwise usable server-side for
    # sign-in-as-user actions.
    try:
        supabase.auth.admin.update_user_by_id(user.id, {"password": body.password})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Password updated."}


# ---- Ownership helpers ----
# Render authenticates to Supabase with the service-role key, which bypasses
# RLS, so the API itself must enforce that a researcher only sees their own
# experiment tree. Each helper walks up to the owning experiment and 404s
# (not 403) if the row doesn't exist or belongs to someone else.

def owned_experiment(experiment_id: str, user_id: str) -> dict:
    response = (
        supabase.table("experiments")
        .select("*")
        .eq("id", experiment_id)
        .eq("created_by", user_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return response.data[0]


def owned_condition(condition_id: str, user_id: str) -> dict:
    response = supabase.table("conditions").select("*").eq("id", condition_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Condition not found")
    condition = response.data[0]
    owned_experiment(condition["experiment_id"], user_id)
    return condition


def owned_cell(cell_id: str, user_id: str) -> dict:
    response = supabase.table("cells").select("*").eq("id", cell_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Cell not found")
    cell = response.data[0]
    owned_condition(cell["condition_id"], user_id)
    return cell


# ---- Storage ----
# The `cell-images` bucket is public — both preview and cell images are
# loaded by the browser via plain <img src>, which can't carry an auth
# header, so the returned URL must be publicly fetchable.

def upload_png(path: str, png_bytes: bytes) -> str:
    supabase.storage.from_("cell-images").upload(
        path, png_bytes, file_options={"content-type": "image/png"}
    )
    return supabase.storage.from_("cell-images").get_public_url(path)


# ---- Experiments ----

class ExperimentBody(BaseModel):
    name: str
    date: Optional[str] = None
    dye: Optional[str] = None
    notes: Optional[str] = None


@app.get("/experiments")
def list_experiments(user=Depends(get_current_user)):
    response = (
        supabase.table("experiments")
        .select("*, conditions(count)")
        .eq("created_by", user.id)
        .execute()
    )
    experiments = []
    for row in response.data:
        conditions = row.pop("conditions", None) or []
        row["condition_count"] = conditions[0]["count"] if conditions else 0
        experiments.append(row)
    return experiments


@app.post("/experiments")
def create_experiment(body: ExperimentBody, user=Depends(get_current_user)):
    response = (
        supabase.table("experiments")
        .insert({
            "name": body.name,
            "date": body.date,
            "dye": body.dye,
            "notes": body.notes,
            "created_by": user.id,
        })
        .execute()
    )
    return response.data[0]


@app.put("/experiments/{experiment_id}")
def update_experiment(experiment_id: str, body: ExperimentBody, user=Depends(get_current_user)):
    owned_experiment(experiment_id, user.id)
    response = (
        supabase.table("experiments")
        .update({
            "name": body.name,
            "date": body.date,
            "dye": body.dye,
            "notes": body.notes,
        })
        .eq("id", experiment_id)
        .execute()
    )
    return response.data[0]


@app.delete("/experiments/{experiment_id}")
def delete_experiment(experiment_id: str, user=Depends(get_current_user)):
    owned_experiment(experiment_id, user.id)
    condition_ids = [
        row["id"]
        for row in supabase.table("conditions").select("id").eq("experiment_id", experiment_id).execute().data
    ]
    if condition_ids:
        cell_ids = [
            row["id"]
            for row in supabase.table("cells").select("id").in_("condition_id", condition_ids).execute().data
        ]
        if cell_ids:
            supabase.table("counts").delete().in_("cell_id", cell_ids).execute()
            supabase.table("cells").delete().in_("condition_id", condition_ids).execute()
        supabase.table("conditions").delete().eq("experiment_id", experiment_id).execute()
    supabase.table("experiments").delete().eq("id", experiment_id).execute()
    return {"status": "deleted"}


# ---- Conditions ----

class ConditionBody(BaseModel):
    name: str
    starvation: Optional[float] = None
    notes: Optional[str] = None


@app.get("/experiments/{experiment_id}/conditions")
def list_conditions(experiment_id: str, user=Depends(get_current_user)):
    owned_experiment(experiment_id, user.id)
    response = (
        supabase.table("conditions")
        .select("*, cells(*, counts(*))")
        .eq("experiment_id", experiment_id)
        .execute()
    )
    return response.data


@app.post("/experiments/{experiment_id}/conditions")
def create_condition(experiment_id: str, body: ConditionBody, user=Depends(get_current_user)):
    owned_experiment(experiment_id, user.id)
    response = (
        supabase.table("conditions")
        .insert({
            "experiment_id": experiment_id,
            "name": body.name,
            "starvation": body.starvation,
            "notes": body.notes,
        })
        .execute()
    )
    return response.data[0]


@app.put("/conditions/{condition_id}")
def update_condition(condition_id: str, body: ConditionBody, user=Depends(get_current_user)):
    owned_condition(condition_id, user.id)
    response = (
        supabase.table("conditions")
        .update({
            "name": body.name,
            "starvation": body.starvation,
            "notes": body.notes,
        })
        .eq("id", condition_id)
        .execute()
    )
    return response.data[0]


@app.delete("/conditions/{condition_id}")
def delete_condition(condition_id: str, user=Depends(get_current_user)):
    owned_condition(condition_id, user.id)
    cell_ids = [
        row["id"]
        for row in supabase.table("cells").select("id").eq("condition_id", condition_id).execute().data
    ]
    if cell_ids:
        supabase.table("counts").delete().in_("cell_id", cell_ids).execute()
        supabase.table("cells").delete().eq("condition_id", condition_id).execute()
    supabase.table("conditions").delete().eq("id", condition_id).execute()
    return {"status": "deleted"}


# ---- Cells ----

class CellUpdateBody(BaseModel):
    name: str


@app.get("/conditions/{condition_id}/cells")
def list_cells(condition_id: str, user=Depends(get_current_user)):
    owned_condition(condition_id, user.id)
    response = (
        supabase.table("cells")
        .select("*, counts(*)")
        .eq("condition_id", condition_id)
        .execute()
    )
    return response.data


@app.put("/cells/{cell_id}")
def update_cell(cell_id: str, body: CellUpdateBody, user=Depends(get_current_user)):
    owned_cell(cell_id, user.id)
    response = (
        supabase.table("cells")
        .update({"name": body.name})
        .eq("id", cell_id)
        .execute()
    )
    return response.data[0]


@app.delete("/cells/{cell_id}")
def delete_cell(cell_id: str, user=Depends(get_current_user)):
    cell = owned_cell(cell_id, user.id)
    supabase.table("counts").delete().eq("cell_id", cell_id).execute()
    supabase.table("cells").delete().eq("id", cell_id).execute()
    recompute_condition_icc(cell["condition_id"])
    return {"status": "deleted"}


# ---- .tif image pipeline ----
# Loads a raw microscopy .tif, contrast-normalizes it, and renders it as
# grayscale (see api/imaging.py). tif-preview is a render-only step for the
# Add Photos canvas (no DB writes); cells/from-tif crops the same render per
# annotated box and creates one `cells` row per box.

@app.post("/conditions/{condition_id}/tif-preview")
def tif_preview(condition_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    owned_condition(condition_id, user.id)
    tif_bytes = file.file.read()
    try:
        image = render_tif_to_image(tif_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    url = upload_png(f"previews/{condition_id}/{uuid.uuid4()}.png", encode_png(image))
    return {"preview_url": url}


class BoxPct(BaseModel):
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    width: float = Field(ge=0, le=100)
    height: float = Field(ge=0, le=100)


@app.post("/conditions/{condition_id}/cells/from-tif")
def cells_from_tif(
    condition_id: str,
    file: UploadFile = File(...),
    boxes: str = Form(...),
    algorithm: str = Form("otsu_watershed"),
    user=Depends(get_current_user),
):
    owned_condition(condition_id, user.id)

    try:
        box_list = [BoxPct(**b) for b in json.loads(boxes)]
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid boxes payload: {e}")

    if algorithm not in DETECTION_ALGORITHMS:
        raise HTTPException(status_code=422, detail=f"Unknown detection algorithm: {algorithm!r}")

    tif_bytes = file.file.read()
    try:
        plane = load_tif_plane(tif_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    file_basename = os.path.splitext(file.filename)[0]
    number_match = re.search(r"\d+", file_basename)
    file_number = number_match.group() if number_match else file_basename

    count_response = (
        supabase.table("cells")
        .select("id", count="exact")
        .eq("condition_id", condition_id)
        .eq("source_filename", file.filename)
        .execute()
    )
    next_number = (count_response.count or 0) + 1

    created_cells = []
    for box in box_list:
        raw_crop = crop_array_percent(plane, box.x, box.y, box.width, box.height)
        # normalize_to_uint16: linear min/max stretch, not render_display_image's
        # percentile clip — nothing discarded before either consumer runs
        # (see api/detection.py). render_hand_count_image produces the
        # stored grayscale crop; detect_droplets independently runs its own
        # threshold/fill-holes/watershed pass on this same normalized_crop
        # to get the auto-count — the two share no intermediate result.
        normalized_crop = normalize_to_uint16(raw_crop)
        hand_count_crop = render_hand_count_image(normalized_crop)
        url = upload_png(f"cells/{condition_id}/{uuid.uuid4()}.png", encode_png_16(hand_count_crop))

        auto_count, auto_coords = detect_droplets(normalized_crop, algorithm=algorithm)
        # Store as percent-of-crop {x, y}, matching the coordinate convention
        # the Count screen already uses for hand-count markers (app.js
        # addMarkerAt), so both point grids share one format.
        crop_height, crop_width = normalized_crop.shape[:2]
        auto_points = [
            {"x": round(col / crop_width * 100, 2), "y": round(row / crop_height * 100, 2)}
            for row, col in auto_coords
        ]

        response = (
            supabase.table("cells")
            .insert({
                "condition_id": condition_id,
                "name": f"Cell{file_number}_{next_number}",
                "image_url": url,
                "source_filename": file.filename,
            })
            .execute()
        )
        cell = response.data[0]
        supabase.table("counts").insert({
            "cell_id": cell["id"],
            "value": auto_count,
            "points": auto_points,
            "type": algorithm,
            "counted_by": user.id,
        }).execute()
        created_cells.append(cell)
        next_number += 1

    return created_cells


# ---- ICC ----
# conditions.icc is kept fresh automatically (see create_count/delete_count
# below) rather than requiring an explicit trigger from the frontend, which
# never calls one. Only cells with all 3 hand counts are included — pingouin's
# ANOVA-based estimator wants a fully-crossed balanced design, and a
# still-in-progress cell shouldn't count against a condition's reliability.

def compute_icc(cells: list) -> Optional[float]:
    """Pure function: cells is [{"id", "counts": [{"value", "created_at", "type"}, ...]}, ...].
    counts may include a non-hand (auto) row alongside the up-to-3 hand
    counts, so hand counts are filtered out before the exactly-3 gate."""
    rows = []
    for cell in cells:
        counts = [c for c in (cell.get("counts") or []) if c.get("type") == "hand"]
        counts = sorted(counts, key=lambda c: c["created_at"])
        if len(counts) != 3:
            continue
        for rater, count in enumerate(counts, start=1):
            rows.append({"cell_id": cell["id"], "rater": rater, "value": count["value"]})

    if len({r["cell_id"] for r in rows}) < 2:
        return None

    df = pd.DataFrame(rows)
    icc_table = pg.intraclass_corr(data=df, targets="cell_id", raters="rater", ratings="value")
    # "ICC(C,k)": two-way mixed, average of the k fixed count slots, consistency
    # (not absolute agreement) — matches cell.average already being the mean
    # of the fixed 3 count slots (see McGraw & Wong / pingouin's naming).
    icc_row = icc_table[icc_table["Type"] == "ICC(C,k)"]
    if icc_row.empty:
        return None
    return float(icc_row["ICC"].iloc[0])


def recompute_condition_icc(condition_id: str) -> None:
    response = (
        supabase.table("cells")
        .select("id, counts(value, created_at, type)")
        .eq("condition_id", condition_id)
        .execute()
    )
    icc_value = compute_icc(response.data)
    supabase.table("conditions").update({"icc": icc_value}).eq("id", condition_id).execute()


@app.post("/conditions/{condition_id}/recompute-icc")
def recompute_icc_endpoint(condition_id: str, user=Depends(get_current_user)):
    owned_condition(condition_id, user.id)
    recompute_condition_icc(condition_id)
    return {"status": "ok"}


# ---- Counts ----

class CountPoint(BaseModel):
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)


class CountBody(BaseModel):
    value: int
    points: Optional[list[CountPoint]] = None


@app.post("/cells/{cell_id}/counts")
def create_count(cell_id: str, body: CountBody, user=Depends(get_current_user)):
    cell = owned_cell(cell_id, user.id)
    response = (
        supabase.table("counts")
        .insert({
            "cell_id": cell_id,
            "value": body.value,
            "points": [p.dict() for p in body.points] if body.points is not None else None,
            "counted_by": user.id,
            "type": "hand",
        })
        .execute()
    )
    recompute_condition_icc(cell["condition_id"])
    return response.data[0]


@app.put("/counts/{count_id}")
def update_count(count_id: str, body: CountBody, user=Depends(get_current_user)):
    """Lets a researcher reopen a saved hand count and adjust its points
    (see the Count screen's edit flow in app.js) rather than only being
    able to delete and recount from scratch."""
    response = supabase.table("counts").select("*").eq("id", count_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Count not found")
    cell = owned_cell(response.data[0]["cell_id"], user.id)
    response = (
        supabase.table("counts")
        .update({
            "value": body.value,
            "points": [p.dict() for p in body.points] if body.points is not None else None,
        })
        .eq("id", count_id)
        .execute()
    )
    recompute_condition_icc(cell["condition_id"])
    return response.data[0]


@app.delete("/counts/{count_id}")
def delete_count(count_id: str, user=Depends(get_current_user)):
    response = supabase.table("counts").select("*").eq("id", count_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Count not found")
    cell = owned_cell(response.data[0]["cell_id"], user.id)
    supabase.table("counts").delete().eq("id", count_id).execute()
    recompute_condition_icc(cell["condition_id"])
    return {"status": "deleted"}
