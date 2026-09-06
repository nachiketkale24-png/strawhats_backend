# Mumbai Flood Susceptibility Frontend

React, TypeScript and MapLibre frontend connected to `../mumbai-flood-prototype`.

## Run locally

Start the prototype API in a separate terminal, from its project directory:

```powershell
cd C:\Dev\strawhats_backend\mumbai-flood-prototype
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

Run the offline pipeline at least once if no event outputs exist:

```powershell
.\.venv\Scripts\python.exe -m pipeline.run_intervals
```

Then start this frontend:

```powershell
cd C:\Dev\strawhats_backend\frontend
npm install
npm run dev
```

Open the local URL printed by Vite. `/api` requests are proxied to `http://127.0.0.1:8000`.
Use the prototype backend above; the separate older `../backend` application has a different API contract.

## Check the connection

1. Select a historical rainfall event. The default is 15 minutes. Use the bottom controls to increase the observed rainfall accumulation to 30, 60, 90, 120 or 180 minutes. Refresh events after generating new outputs.
2. Check the event's FSI minimum, mean and maximum and the colored raster overlay.
3. In Inspect mode, click the map to fetch the FSI at that location.
4. Choose Pick route, then click a start and destination inside Mumbai road coverage.
   The API snaps coordinates to its real road graph. Cyan shows the flood-aware path;
   gray shows the shortest path. The panel compares distances and maximum/average FSI.
5. Download FSI raster retrieves the original event GeoTIFF.

The frontend calls `GET /flood/events`, `GET /flood/summary/{event_date}`,
`GET /flood/raster/{event_date}`, `GET /flood/point/{event_date}`, `GET /flood/windows/{event_date}`, and `POST /route`. The selected `window_minutes` is sent with every data and routing request.
Event changes and new selections cancel stale requests. API failures and missing outputs
are displayed without substituting synthetic results.

FSI is relative susceptibility from 0 to 1, not flood depth or a live forecast.
The existing synthetic forecast and drainage modules are retained but are no longer
used by the connected map. The browser displays WGS84 GeoTIFFs with transparent NoData
and a nearest-neighbor preview reprojected per pixel into Web Mercator, capped at 1536 pixels on its longest side. The projection is checked against Rasterio/GDAL. The supplied DEM covers only 19.0?19.2978?N; no flood coverage is invented for southern Mumbai. Point inspection
and summaries use the backend's original data. Unsupported raster projections show an
error and remain available to download. Display colors use the pipeline's four FSI bins.

## Configuration and build

`npm run build` checks TypeScript and produces `dist/`.
For a separately hosted API, copy `.env.example` to `.env.local`, set
`VITE_API_BASE_URL=https://your-api-host`, then restart Vite or rebuild.
This URL is public frontend configuration and must not contain secrets.
Production hosting must either proxy `/api` to the Python backend or set this URL;
Vite's development proxy does not apply to `npm run preview` or static hosting.
The API must permit the frontend origin through CORS.

Map tiles and 3D buildings require internet access. Satellite and 3D controls retain
the existing map behavior. The offline Python calculations are unchanged.


Historical dates available after preprocessing: 2015-06-19, 2017-08-29 and
2020-09-23. The displayed start/end times use workbook timestamps; the workbook
does not declare a timezone. These controls accumulate observed rainfall from the
same event start; they do not predict future rainfall. FSI need not increase with
duration because the validated formula normalizes each rainfall grid spatially.

Integration checks (run from frontend with the prototype API and Vite running):

```sh
node --experimental-strip-types scripts/check-raster-projection.mjs
node scripts/check-event-intervals.mjs
```

The first check compares every display pixel with Rasterio/GDAL EPSG:3857 output
using the prototype Python environment. The second checks all 18 interval rasters,
summaries, exact point samples, route endpoints, and invalid-duration responses.
