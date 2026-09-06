"""
Attaches flood risk (from the FSI raster) to each road segment, and computes
the final edge weights the backend's routing service will load directly.

This is the critical handoff step: everything the backend needs for routing
must already be baked into the saved graph pickle, so the API never has to
import momepy or run zonal stats at request time.
"""

import pickle

from rasterstats import zonal_stats

from . import config
from .road_graph_builder import graph_to_edges_gdf


def attach_flood_risk(G, roads_m_crs, flood_risk_tif_path, buffer_m=config.ROAD_BUFFER_METERS):
    """
    Mutates G in place: adds `flood_risk`, `weight_normal`, and
    `weight_flood_aware` to every edge.
    """
    edges_gdf = graph_to_edges_gdf(G, roads_m_crs)

    edges_buffered = edges_gdf.copy()
    edges_buffered["geometry"] = edges_gdf.geometry.buffer(buffer_m)
    edges_buffered_wgs84 = edges_buffered.to_crs(config.WGS84)

    stats = zonal_stats(
        edges_buffered_wgs84, str(flood_risk_tif_path),
        stats=["max"], nodata=config.NODATA_VAL,
    )
    edges_gdf["flood_risk_max"] = [s["max"] if s["max"] is not None else 0.0 for s in stats]

    risk_lookup = {
        (row.u, row.v): row.flood_risk_max for row in edges_gdf.itertuples()
    }

    for u, v, d in G.edges(data=True):
        risk = risk_lookup.get((u, v), 0.0)
        d["flood_risk"] = risk
        d["weight_normal"] = d["length_m"]
        d["weight_flood_aware"] = d["length_m"] * config.risk_penalty_multiplier(risk)

    return G, edges_gdf


def save_graph(G, out_path):
    with open(out_path, "wb") as f:
        pickle.dump(G, f)
    return out_path


def load_graph(path):
    with open(path, "rb") as f:
        return pickle.load(f)
