import json
import os
import uuid
from typing import Optional

import pandas as pd
import pingouin as pg
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client

from detection import count_droplets
from imaging import (
    crop_array_percent,
    crop_percent,
    encode_png,
    load_tif_plane,
    render_display_image,
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
    username: str
    password: str


@app.post("/auth/login")
def login(body: LoginBody):
    try:
        result = supabase.auth.sign_in_with_password({
            "email": body.username,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not result or not result.session:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"token": result.session.access_token}


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

def upload_png(path: str, image) -> str:
    png_bytes = encode_png(image)
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


# ---- Conditions ----

class ConditionBody(BaseModel):
    name: str
    dye: Optional[str] = None
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
            "dye": body.dye,
            "starvation": body.starvation,
            "notes": body.notes,
        })
        .execute()
    )
    return response.data[0]


# ---- Cells ----

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


# ---- .tif image pipeline ----
# Loads a raw microscopy .tif, contrast-normalizes it, and applies a green
# false-color LUT for the BODIPY channel (see api/imaging.py). tif-preview
# is a render-only step for the Add Photos canvas (no DB writes); cells/
# from-tif crops the same render per annotated box and creates one `cells`
# row per box.

@app.post("/conditions/{condition_id}/tif-preview")
def tif_preview(condition_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    owned_condition(condition_id, user.id)
    tif_bytes = file.file.read()
    try:
        image = render_tif_to_image(tif_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    url = upload_png(f"previews/{condition_id}/{uuid.uuid4()}.png", image)
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
    user=Depends(get_current_user),
):
    owned_condition(condition_id, user.id)

    try:
        box_list = [BoxPct(**b) for b in json.loads(boxes)]
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid boxes payload: {e}")

    tif_bytes = file.file.read()
    try:
        plane = load_tif_plane(tif_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    image = render_display_image(plane)

    count_response = (
        supabase.table("cells")
        .select("id", count="exact")
        .eq("condition_id", condition_id)
        .execute()
    )
    next_number = (count_response.count or 0) + 1

    created_cells = []
    for box in box_list:
        crop = crop_percent(image, box.x, box.y, box.width, box.height)
        url = upload_png(f"cells/{condition_id}/{uuid.uuid4()}.png", crop)

        analysis_crop = crop_array_percent(plane, box.x, box.y, box.width, box.height)
        auto_count = count_droplets(analysis_crop)

        response = (
            supabase.table("cells")
            .insert({
                "condition_id": condition_id,
                "name": f"Cell {next_number}",
                "image_url": url,
                "auto_count": auto_count,
            })
            .execute()
        )
        created_cells.append(response.data[0])
        next_number += 1

    return created_cells


# ---- ICC ----
# conditions.icc is kept fresh automatically (see create_count/delete_count
# below) rather than requiring an explicit trigger from the frontend, which
# never calls one. Only cells with all 3 hand counts are included — pingouin's
# ANOVA-based estimator wants a fully-crossed balanced design, and a
# still-in-progress cell shouldn't count against a condition's reliability.

def compute_icc(cells: list) -> Optional[float]:
    """Pure function: cells is [{"id", "counts": [{"value", "created_at"}, ...]}, ...]."""
    rows = []
    for cell in cells:
        counts = sorted(cell.get("counts") or [], key=lambda c: c["created_at"])
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
        .select("id, counts(value, created_at)")
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

class CountBody(BaseModel):
    value: int


@app.post("/cells/{cell_id}/counts")
def create_count(cell_id: str, body: CountBody, user=Depends(get_current_user)):
    cell = owned_cell(cell_id, user.id)
    response = (
        supabase.table("counts")
        .insert({
            "cell_id": cell_id,
            "value": body.value,
            "counted_by": user.id,
        })
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
