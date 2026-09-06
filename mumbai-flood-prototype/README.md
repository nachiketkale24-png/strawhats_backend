# Mumbai Flood Prototype

Mumbai Urban Flood Susceptibility Index (FSI) and flood-aware routing prototype for SIH.

Run all commands from this project directory (`mumbai-flood-prototype/`), because configuration paths are relative to the working directory.

Install dependencies:

```sh
pip install -r requirements.txt
```

Run the offline pipeline once to generate outputs for the selected historical rainfall event:

```sh
python -m pipeline.run_pipeline
```

The supplied intermediates `mumbai_dem_clipped.tif`, `landcover_features.tif`, and `mumbai_vehicle_roads.gpkg` must be present in `data/processed/`; raw inputs belong in `data/raw/`.

Start the API server:

```sh
uvicorn backend.main:app --reload --port 8000
```

Run the pipeline at least once before the backend has event data to serve. The backend reads precomputed `data/processed/flood_risk_<event_date>.tif` and `data/processed/mumbai_road_graph_<event_date>.gpickle` files. It never recomputes these outputs live; route requests compute paths using the precomputed graph.


## Historical 15-minute intervals

Generate all three selected heavy-rainfall dates and their 15, 30, 60, 90, 120,
and 180-minute outputs (this may take several minutes per event):

```sh
python -m pipeline.run_intervals
```

To generate one selected date, use `--event-date 2017-08-29` (also available:
`2015-06-19` and `2020-09-23`). Completed interval outputs are reused on subsequent
runs. Each date starts at its strongest complete three-hour window by mean station
rainfall. Duration totals include workbook samples with timestamps in
`[start_time, end_time)`. Missing readings are not fabricated: candidate windows
with any missing matched-station observations are rejected. Times retain the
workbook's unspecified timezone and are displayed as workbook time.

These are observed historical accumulation windows, not future forecasts. The
original FSI, spatial interpolation, slope, and routing weight formulas are reused
unchanged. Because rainfall is normalized spatially separately for each interval,
a longer duration does not necessarily increase FSI at every location.

Each interval writes `flood_risk_<date>_<minutes>min.tif` and
`mumbai_road_graph_<date>_<minutes>min.gpickle`. `event_windows_<date>.json` publishes
only intervals with both outputs ready. The API never computes these outputs live.
Use `GET /flood/windows/{event_date}` to discover intervals; pass
`?window_minutes=15` to the summary, raster and point endpoints, or include
`"window_minutes": 15` in a route request. Existing daily files and daily requests
remain supported. Dates generated only by the interval pipeline require a duration.
Restart the API after source changes.
