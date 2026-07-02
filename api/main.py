from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import os
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
@app.get("/cells")
def get_cells():
    response = supabase.table("cells").select("*").execute()
    return response.data