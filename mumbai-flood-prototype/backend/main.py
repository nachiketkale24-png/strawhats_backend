"""
FastAPI entrypoint for the Mumbai Flood Prototype backend.

Run with:
    uvicorn backend.main:app --reload --port 8000

Expects the offline pipeline (pipeline/run_pipeline.py) to have already
produced, for at least one event:
    data/processed/flood_risk_<event_date>.tif
    data/processed/mumbai_road_graph_<event_date>.gpickle
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import flood, routing

app = FastAPI(
    title="Mumbai Flood Prototype API",
    description="Flood Susceptibility Index + flood-aware routing for Mumbai (prototype).",
    version="0.1.0",
)

# Loosen for the hackathon demo; tighten before any real deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(flood.router)
app.include_router(routing.router)


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Mumbai Flood Prototype API — see /docs for endpoints",
    }
