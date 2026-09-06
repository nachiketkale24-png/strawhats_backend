"""Precompute historical 15–180 minute FSI and routing, using validated formulas.

Run from the project root: python -m pipeline.run_intervals
The start is the strongest complete three-hour rainfall window on each selected day.
All durations accumulate observed 15-minute records from that same start.
"""
import json
import argparse
import pandas as pd

from . import config
from .dem_processing import load_and_clean_dem, compute_slope_degrees, get_dem_grid_coords
from .landcover_processing import load_landcover_features
from .rainfall_processing import (
    load_rainfall_and_stations,
    select_heavy_rainfall_events,
    interpolate_rainfall_to_grid,
    compute_station_coverage_mask,
)
from .fsi_model import compute_vulnerability, compute_fsi, save_fsi_raster, save_raster
from .road_graph_builder import build_road_graph
from .road_risk_attribution import attach_flood_risk, save_graph

DURATIONS = tuple(config.AVAILABLE_WINDOWS_MIN)


def select_window(day, station_cols):
    """Select a complete, observed 3-hour block; never fill missing rainfall with zero."""
    candidates = []
    for start in day.index:
        expected = pd.date_range(start, periods=12, freq="15min")
        if expected[-1].date() != start.date():
            continue
        block = day.reindex(expected)[station_cols]
        if block.isna().any().any():
            continue
        candidates.append((float(block.sum().mean()), start))
    if not candidates:
        raise ValueError("No complete three-hour window across all matched stations")
    return max(candidates, key=lambda item: item[0])[1]


def run(event_date=None, force=False):
    config.DATA_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    print('Loading historical rainfall and raster inputs...', flush=True)
    rainfall, stations, station_cols = load_rainfall_and_stations()
    dates = select_heavy_rainfall_events(rainfall, station_cols)
    if event_date is not None:
        dates = [date for date in dates if date.strftime('%Y-%m-%d') == event_date]
        if not dates:
            raise ValueError(f'{event_date} is not one of the selected historical events')
    dem, transform, crs, valid = load_and_clean_dem()
    slope = compute_slope_degrees(dem, valid, transform)
    lon, lat = get_dem_grid_coords(dem.shape, transform)
    built, water, lc_nodata = load_landcover_features()
    valid = valid & (built != lc_nodata)

    vulnerability = compute_vulnerability(built, slope, water, valid)
    save_raster(vulnerability, valid, transform, crs, config.VULNERABILITY_TIF, 'vulnerability')
    print(f'Saved static vulnerability: {config.VULNERABILITY_TIF}', flush=True)

    coverage = compute_station_coverage_mask(stations, station_cols, lon, lat)
    inside_pct = 100.0 * coverage[valid].mean() if valid.any() else 0.0
    print(f'Station network coverage (interpolated): {inside_pct:.1f}% of valid cells', flush=True)
    save_raster(coverage.astype('float32'), valid, transform, crs, config.COVERAGE_MASK_TIF, 'station_coverage')
    print(f'Saved coverage mask: {config.COVERAGE_MASK_TIF}', flush=True)

    print('Building road graph...', flush=True)
    graph, roads = build_road_graph()
    for date in dates:
        event = date.strftime("%Y-%m-%d")
        day = rainfall.loc[rainfall.index.date == date.date()]
        start = select_window(day, station_cols)
        manifest = {"event_date": event, "kind": "historical_observed", "start_time": start.isoformat(),
                    "time_basis": "Workbook timestamps (timezone unspecified)",
                    "selection": "Strongest complete three-hour window by mean station rainfall", "windows": []}
        for minutes in DURATIONS:
            key = f"{event}_{minutes}min"
            raster_path = config.flood_risk_tif(key)
            graph_path = config.road_graph_pickle(key)
            end = start + pd.Timedelta(minutes=minutes)
            if force or not (raster_path.exists() and graph_path.exists()):
                print(f'Computing {event}: {minutes} minutes...', flush=True)
                totals = day.loc[(day.index >= start) & (day.index < end), station_cols].sum()
                grid = interpolate_rainfall_to_grid(totals, stations, station_cols, lon, lat)
                fsi, _ = compute_fsi(grid, vulnerability, valid)
                save_fsi_raster(fsi, valid, transform, crs, raster_path)
                weighted, _ = attach_flood_risk(graph.copy(), roads.crs, raster_path)
                temporary = graph_path.with_suffix('.gpickle.tmp')
                save_graph(weighted, temporary)
                temporary.replace(graph_path)
            manifest["windows"].append({"minutes": minutes, "start_time": start.isoformat(), "end_time": end.isoformat()})
            # Publish only intervals with both a finished raster and graph.
            manifest_path = config.DATA_PROCESSED_DIR / f"event_windows_{event}.json"
            temporary = manifest_path.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            temporary.replace(manifest_path)
            print(f"Ready: {event}, {minutes} min, {start.time()}–{end.time()}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--event-date', help='Generate only this selected event (YYYY-MM-DD)')
    parser.add_argument('--force', action='store_true', help='Recompute even if rasters and graphs already exist')
    args = parser.parse_args()
    run(args.event_date, force=args.force)
