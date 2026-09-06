"""
Central configuration for the Mumbai flood pipeline.
"""

from pathlib import Path

# ---------------------------------------------------------
# Directories
# ---------------------------------------------------------
DATA_RAW_DIR = Path("data/raw")
DATA_PROCESSED_DIR = Path("data/processed")

# ---------------------------------------------------------
# Raw input files
# ---------------------------------------------------------
RAINFALL_XLSX = DATA_RAW_DIR / "Cleaned_Combined_Rainfall_2015_23.xlsx"
STATION_COORDS_XLSX = DATA_RAW_DIR / "Rainfall_Station_Coordinates.xlsx"
DEM_RAW_TIF = DATA_RAW_DIR / "P5_PAN_CD_N19_000_E072_000_DEM_30m.tif"
WORLDCOVER_TIF = DATA_RAW_DIR / "ESA_WorldCover_10m_2021_v200_N18E072_Map.tif"
ROADS_PBF = DATA_RAW_DIR / "western-zone-260904.osm.pbf"

# ---------------------------------------------------------
# Processed / intermediate files
# ---------------------------------------------------------
DEM_CLIPPED_TIF = DATA_PROCESSED_DIR / "mumbai_dem_clipped.tif"
LANDCOVER_FEATURES_TIF = DATA_PROCESSED_DIR / "landcover_features.tif"
ROADS_GPKG = DATA_PROCESSED_DIR / "mumbai_vehicle_roads.gpkg"

# Static vulnerability layer — terrain/surface only, reused across events.
VULNERABILITY_TIF = DATA_PROCESSED_DIR / "vulnerability.tif"
# True inside the rainfall-station convex hull (interpolated), False outside (extrapolated).
COVERAGE_MASK_TIF = DATA_PROCESSED_DIR / "coverage_mask.tif"


def flood_risk_tif(event_date: str, window_minutes: int = None) -> Path:
    if window_minutes:
        return DATA_PROCESSED_DIR / f"flood_risk_{event_date}_{window_minutes}min.tif"
    return DATA_PROCESSED_DIR / f"flood_risk_{event_date}.tif"


def road_risk_gpkg(event_date: str) -> Path:
    return DATA_PROCESSED_DIR / f"road_risk_{event_date}.gpkg"


def road_graph_pickle(event_date: str) -> Path:
    return DATA_PROCESSED_DIR / f"mumbai_road_graph_{event_date}.gpickle"


# ---------------------------------------------------------
# CRS
# ---------------------------------------------------------
WGS84 = "EPSG:4326"
UTM_43N = "EPSG:32643"

# ---------------------------------------------------------
# Raster / NoData
# ---------------------------------------------------------
NODATA_VAL = -9999.0
IMPLAUSIBLE_LOW_ELEVATION = -50.0

# ---------------------------------------------------------
# Rainfall event selection
# ---------------------------------------------------------
N_EVENTS_TO_SELECT = 3
MIN_EVENT_GAP_DAYS = 3

# IDW interpolation (replaces griddata linear+nearest)
IDW_POWER = 2
IDW_K_NEAREST = 8

# Windowed rainfall accumulation options offered by the frontend
AVAILABLE_WINDOWS_MIN = [15, 30, 60, 90, 120, 180]

# ---------------------------------------------------------
# FSI weights
# ---------------------------------------------------------
# Rainfall is applied multiplicatively against vulnerability, not summed with it.
VULNERABILITY_WEIGHTS = {
    "built_up": 0.55,
    "low_slope": 0.45,
    "water_buffer": 0.30,  # subtracted
}

FSI_RISK_BINS = [0, 0.25, 0.5, 0.75, 1.01]
FSI_RISK_LABELS = ["Low", "Medium", "High", "Severe"]

# ---------------------------------------------------------
# Routing
# ---------------------------------------------------------
ROAD_BUFFER_METERS = 15

# Bounded, category-based penalty instead of unbounded length * (1 + 15*risk).
RISK_PENALTY_TABLE = [
    (0.25, 1.0),   # Low    -> no real penalty
    (0.50, 1.3),   # Medium -> mild preference against
    (0.75, 2.5),   # High   -> meaningful avoidance
    (1.01, 6.0),   # Severe -> strong avoidance, but bounded
]


def risk_penalty_multiplier(risk_value: float) -> float:
    for threshold, multiplier in RISK_PENALTY_TABLE:
        if risk_value < threshold:
            return multiplier
    return RISK_PENALTY_TABLE[-1][1]
