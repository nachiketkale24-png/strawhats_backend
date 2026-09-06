"""
Rainfall loading, historical heavy-event selection, and spatial interpolation
of station rainfall onto the DEM's 30 m grid.
"""

import numpy as np
import pandas as pd
from scipy.spatial import Delaunay, cKDTree

from . import config


def load_rainfall_and_stations(
    rainfall_path=config.RAINFALL_XLSX,
    coords_path=config.STATION_COORDS_XLSX,
):
    """
    Returns
    -------
    rainfall_df : DataFrame indexed by timestamp, one column per station
    station_map : dict {column_name: {"Latitude": ..., "Longitude": ...}}
    station_cols: list of rainfall column names that have matched coordinates
    """
    rainfall_df = pd.read_excel(rainfall_path)
    rainfall_df = rainfall_df.rename(columns={"Index2": "timestamp"})
    rainfall_df["timestamp"] = pd.to_datetime(rainfall_df["timestamp"])
    rainfall_df = rainfall_df.set_index("timestamp")

    stations = pd.read_excel(coords_path)
    station_map = stations.set_index("Column")[["Latitude", "Longitude"]].to_dict("index")
    station_cols = [c for c in rainfall_df.columns if c in station_map]

    return rainfall_df, station_map, station_cols


def select_heavy_rainfall_events(
    rainfall_df,
    station_cols,
    n_events=config.N_EVENTS_TO_SELECT,
    min_gap_days=config.MIN_EVENT_GAP_DAYS,
):
    """
    Ranks days by city-wide mean daily rainfall accumulation and picks the
    top N non-overlapping dates (skipping dates within `min_gap_days` of an
    already-selected date, since they're likely the same multi-day system).
    """
    daily = rainfall_df[station_cols].resample("1D").sum()
    daily_mean_accum = daily.mean(axis=1).sort_values(ascending=False)

    selected_dates = []
    for date in daily_mean_accum.index:
        if all(abs((date - d).days) > min_gap_days for d in selected_dates):
            selected_dates.append(date)
        if len(selected_dates) == n_events:
            break

    return selected_dates


def get_event_totals(rainfall_df, event_date, station_cols):
    """Total rainfall per station for the calendar day of `event_date`."""
    return rainfall_df.loc[
        rainfall_df.index.date == event_date.date(), station_cols
    ].sum()


def interpolate_rainfall_to_grid(
    event_totals, station_map, station_cols, grid_lon, grid_lat,
    power=config.IDW_POWER, k_nearest=config.IDW_K_NEAREST,
):
    """
    Inverse Distance Weighting (IDW) interpolation — replaces the previous
    griddata(linear) + griddata(nearest) approach, which produced sharp
    Delaunay-triangle artifacts and flat single-station plateaus outside
    the station network's convex hull.

    IDW is defined everywhere, so there is no NaN / nearest-fallback patch.
    Cells outside the station hull are still filled, but they are
    extrapolations — pair this with compute_station_coverage_mask.
    """
    points = np.array(
        [[station_map[c]["Longitude"], station_map[c]["Latitude"]] for c in station_cols]
    )
    values = event_totals[station_cols].values

    tree = cKDTree(points)
    grid_points = np.column_stack([grid_lon.ravel(), grid_lat.ravel()])

    k = min(k_nearest, len(points))
    dists, idxs = tree.query(grid_points, k=k)
    if dists.ndim == 1:
        dists = dists[:, np.newaxis]
        idxs = idxs[:, np.newaxis]

    # Avoid division-by-zero exactly at a station's own coordinate
    dists = np.maximum(dists, 1e-6)

    weights = 1.0 / (dists ** power)
    weights /= weights.sum(axis=1, keepdims=True)

    interpolated = np.sum(weights * values[idxs], axis=1)
    return interpolated.reshape(grid_lon.shape)


def compute_station_coverage_mask(station_map, station_cols, grid_lon, grid_lat):
    """
    True where a grid cell is inside the station network's convex hull
    (interpolated with real nearby support), False where it's extrapolated.
    Use this to shade/hatch low-confidence areas on the dashboard rather
    than presenting the whole map as equally reliable.
    """
    hull_points = np.array(
        [[station_map[c]["Longitude"], station_map[c]["Latitude"]] for c in station_cols]
    )
    hull = Delaunay(hull_points)
    grid_points = np.column_stack([grid_lon.ravel(), grid_lat.ravel()])
    inside = hull.find_simplex(grid_points) >= 0
    return inside.reshape(grid_lon.shape)


def generate_synthetic_scenario(rainfall_grid, scale_factor=1.0, shift_lon=0.0, shift_lat=0.0):
    """
    Produces a labeled synthetic rainfall scenario by scaling a real event's
    grid. NEVER treat this output as real ground truth — always tag results
    computed from it as "Simulated scenario" in the UI.
    """
    scenario = rainfall_grid * scale_factor
    if shift_lon != 0.0 or shift_lat != 0.0:
        scenario = np.roll(scenario, shift=int(shift_lat), axis=0)
        scenario = np.roll(scenario, shift=int(shift_lon), axis=1)
    return scenario
