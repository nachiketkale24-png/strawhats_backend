"""
Routing service. Loads the risk-weighted road graph pickle ONCE (per event,
cached in memory) and serves Dijkstra route requests fast — no graph
rebuilding, no momepy, no zonal stats at request time.
"""

from pathlib import Path

import geopandas as gpd
import networkx as nx
from shapely.geometry import Point

from pipeline import config
from pipeline.road_risk_attribution import load_graph


class RoutingService:
    def __init__(self):
        self._graph_cache = {}       # event_date -> networkx graph
        self._graph_crs = config.UTM_43N

    def _get_graph(self, event_date: str):
        if event_date not in self._graph_cache:
            path = config.road_graph_pickle(event_date)
            if not Path(path).exists():
                raise FileNotFoundError(f"No road graph found for event {event_date}")
            self._graph_cache[event_date] = load_graph(path)
        return self._graph_cache[event_date]

    def _nearest_node(self, G, lon, lat):
        pt = gpd.GeoSeries([Point(lon, lat)], crs=config.WGS84).to_crs(self._graph_crs).iloc[0]
        nodes = list(G.nodes)
        dists = gpd.GeoSeries([Point(n) for n in nodes], crs=self._graph_crs).distance(pt)
        return nodes[dists.idxmin()]

    def _route_stats(self, G, route):
        length = sum(G[route[i]][route[i + 1]]["length_m"] for i in range(len(route) - 1))
        risks = [G[route[i]][route[i + 1]]["flood_risk"] for i in range(len(route) - 1)]
        max_risk = max(risks) if risks else 0.0
        avg_risk = sum(risks) / len(risks) if risks else 0.0
        return length, max_risk, avg_risk

    def _route_to_coords(self, route):
        """Nodes are (x, y) tuples in the metric CRS — convert back to lon/lat for the API."""
        pts = gpd.GeoSeries([Point(n) for n in route], crs=self._graph_crs).to_crs(config.WGS84)
        return [[p.x, p.y] for p in pts]

    def compute_routes(self, event_date, origin_lat, origin_lon, dest_lat, dest_lon):
        G = self._get_graph(event_date)

        origin_node = self._nearest_node(G, origin_lon, origin_lat)
        dest_node = self._nearest_node(G, dest_lon, dest_lat)

        normal_route = nx.shortest_path(G, origin_node, dest_node, weight="weight_normal")
        flood_aware_route = nx.shortest_path(G, origin_node, dest_node, weight="weight_flood_aware")

        n_len, n_max, n_avg = self._route_stats(G, normal_route)
        f_len, f_max, f_avg = self._route_stats(G, flood_aware_route)

        return {
            "event_date": event_date,
            "normal_route": {
                "length_m": n_len, "max_risk": n_max, "avg_risk": n_avg,
                "coordinates": self._route_to_coords(normal_route),
            },
            "flood_aware_route": {
                "length_m": f_len, "max_risk": f_max, "avg_risk": f_avg,
                "coordinates": self._route_to_coords(flood_aware_route),
            },
            "extra_distance_m": f_len - n_len,
            "extra_distance_pct": round(100 * (f_len - n_len) / n_len, 2) if n_len else 0.0,
        }


routing_service = RoutingService()
