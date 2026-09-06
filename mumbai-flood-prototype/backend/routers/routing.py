from fastapi import APIRouter, HTTPException

from backend.services.routing_service import routing_service
from backend.schemas import RouteRequest, RouteResponse
from backend.services.event_windows import event_key

router = APIRouter(prefix="/route", tags=["routing"])


@router.post("", response_model=RouteResponse)
def get_route(req: RouteRequest):
    """
    Computes both the normal (shortest) route and the flood-aware route
    for a given event, and returns both for direct comparison.
    """
    try:
        result = routing_service.compute_routes(
            event_date=event_key(req.event_date, req.window_minutes),
            origin_lat=req.origin_lat,
            origin_lon=req.origin_lon,
            dest_lat=req.dest_lat,
            dest_lon=req.dest_lon,
        )
        result['event_date'] = req.event_date
        return RouteResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except nx_exception_types() as e:
        raise HTTPException(status_code=400, detail=f"No route found: {e}")


def nx_exception_types():
    import networkx as nx
    return (nx.NetworkXNoPath, nx.NodeNotFound)
