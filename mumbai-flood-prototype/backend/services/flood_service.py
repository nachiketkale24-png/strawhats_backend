"""
Serves precomputed FSI rasters. Loads raster metadata lazily/once per event
and caches it in memory — never recomputes FSI from raw rainfall/DEM/land
cover inside a request (that stays in the offline pipeline).
"""

import glob
import re
from pathlib import Path

import rasterio

from pipeline import config
from .event_windows import get_windows


class FloodService:
    def __init__(self):
        self._raster_cache = {}  # event_date -> (array, transform, crs, nodata)
        self._coverage = None

    def list_available_events(self):
        pattern = str(config.DATA_PROCESSED_DIR / "flood_risk_*.tif")
        files = glob.glob(pattern)
        events = []
        for f in files:
            match = re.search(r"flood_risk_(\d{4}-\d{2}-\d{2})\.tif", f)
            if match:
                events.append(match.group(1))
        for path in config.DATA_PROCESSED_DIR.glob('event_windows_*.json'):
            event = path.stem.removeprefix('event_windows_')
            if get_windows(event)['windows']:
                events.append(event)
        return sorted(set(events))

    def _load_raster(self, event_date: str):
        if event_date not in self._raster_cache:
            path = config.flood_risk_tif(event_date)
            if not Path(path).exists():
                raise FileNotFoundError(f"No FSI raster found for event {event_date}")
            with rasterio.open(path) as src:
                array = src.read(1)
                self._raster_cache[event_date] = {
                    "array": array,
                    "transform": src.transform,
                    "crs": src.crs,
                    "nodata": src.nodata,
                    "bounds": src.bounds,
                }
        return self._raster_cache[event_date]

    def get_coverage_path(self) -> str:
        path = config.COVERAGE_MASK_TIF
        if not Path(path).exists():
            raise FileNotFoundError("No station coverage mask found. Re-run the offline pipeline.")
        return str(path)

    def _load_coverage(self):
        if self._coverage is None:
            path = self.get_coverage_path()
            with rasterio.open(path) as src:
                self._coverage = {
                    "array": src.read(1),
                    "transform": src.transform,
                    "nodata": src.nodata,
                }
        return self._coverage

    def sample_coverage(self, lon: float, lat: float):
        """True if the click is inside the station convex hull; None if unknown."""
        try:
            raster = self._load_coverage()
        except FileNotFoundError:
            return None
        row, col = rasterio.transform.rowcol(raster["transform"], lon, lat)
        arr = raster["array"]
        if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1]:
            value = arr[row, col]
            if value == raster["nodata"]:
                return None
            return bool(value >= 0.5)
        return None

    def get_summary(self, event_date: str) -> dict:
        raster = self._load_raster(event_date)
        arr = raster["array"]
        valid = arr != raster["nodata"]
        return {
            "event_date": event_date,
            "fsi_min": float(arr[valid].min()),
            "fsi_max": float(arr[valid].max()),
            "fsi_mean": float(arr[valid].mean()),
        }

    def get_raster_path(self, event_date: str) -> str:
        """Used to serve the raw GeoTIFF file directly (e.g. for a tile server)."""
        path = config.flood_risk_tif(event_date)
        if not Path(path).exists():
            raise FileNotFoundError(f"No FSI raster found for event {event_date}")
        return str(path)

    def sample_at_point(self, event_date: str, lon: float, lat: float) -> float:
        """Returns the FSI value at a specific coordinate — useful for map click interactions."""
        raster = self._load_raster(event_date)
        row, col = rasterio.transform.rowcol(raster["transform"], lon, lat)
        arr = raster["array"]
        if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1]:
            value = arr[row, col]
            return float(value) if value != raster["nodata"] else None
        return None


flood_service = FloodService()
