"""
Builds a routable NetworkX graph from the Mumbai vehicle-road GeoPackage.
This is an offline, one-time (or occasional) operation — never run per API request.
"""

import geopandas as gpd
import momepy
import networkx as nx

from . import config


def build_road_graph(roads_path=config.ROADS_GPKG, target_crs=config.UTM_43N):
    """
    Returns
    -------
    G        : networkx.Graph, largest connected component, with `length_m`
               already computed per edge
    roads_m  : GeoDataFrame in the metric CRS (kept for later CRS reuse)
    """
    roads = gpd.read_file(roads_path)
    roads_m = roads.to_crs(target_crs)
    roads_m["length_m"] = roads_m.geometry.length

    G = momepy.gdf_to_nx(roads_m, approach="primal", multigraph=False)

    if not nx.is_connected(G):
        largest_cc = max(nx.connected_components(G), key=len)
        G = G.subgraph(largest_cc).copy()

    return G, roads_m


def graph_to_edges_gdf(G, crs):
    """Extracts edges back into a GeoDataFrame — needed for zonal-stats risk attribution."""
    edges_data = list(G.edges(data=True))
    edges_gdf = gpd.GeoDataFrame(
        {"u": [e[0] for e in edges_data], "v": [e[1] for e in edges_data]},
        geometry=[d["geometry"] for _, _, d in edges_data],
        crs=crs,
    )
    return edges_gdf
