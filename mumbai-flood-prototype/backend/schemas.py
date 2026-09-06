from typing import List, Optional
from pydantic import BaseModel
from backend.services.event_windows import WindowMinutes


class EventInfo(BaseModel):
    event_date: str
    fsi_min: float
    fsi_max: float
    fsi_mean: float


class RouteRequest(BaseModel):
    window_minutes: Optional[WindowMinutes] = None
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    event_date: str


class RouteSummary(BaseModel):
    length_m: float
    max_risk: float
    avg_risk: float
    coordinates: List[List[float]]  # [[lon, lat], ...]


class RouteResponse(BaseModel):
    event_date: str
    normal_route: RouteSummary
    flood_aware_route: RouteSummary
    extra_distance_m: float
    extra_distance_pct: float


class ScenarioRequest(BaseModel):
    base_event_date: str
    scale_factor: float = 1.0
    shift_lon_cells: int = 0
    shift_lat_cells: int = 0


class ScenarioResponse(BaseModel):
    is_synthetic: bool = True
    label: str
    fsi_summary: dict
