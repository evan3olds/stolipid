import os
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client

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


# ---- Counts ----

class CountBody(BaseModel):
    value: int


@app.post("/cells/{cell_id}/counts")
def create_count(cell_id: str, body: CountBody, user=Depends(get_current_user)):
    owned_cell(cell_id, user.id)
    response = (
        supabase.table("counts")
        .insert({
            "cell_id": cell_id,
            "value": body.value,
            "counted_by": user.id,
        })
        .execute()
    )
    return response.data[0]


@app.delete("/counts/{count_id}")
def delete_count(count_id: str, user=Depends(get_current_user)):
    response = supabase.table("counts").select("*").eq("id", count_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Count not found")
    owned_cell(response.data[0]["cell_id"], user.id)
    supabase.table("counts").delete().eq("id", count_id).execute()
    return {"status": "deleted"}
