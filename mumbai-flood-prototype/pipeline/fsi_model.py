"""
Flood Susceptibility Index (FSI) — corrected multiplicative formulation.

WHY THE CHANGE FROM THE ORIGINAL ADDITIVE FORMULA:
The original formula was:
    fsi = 0.45*rainfall + 0.25*built_up + 0.20*(1-slope) - 0.15*water
This is additive. Because rainfall (after IDW interpolation) varies smoothly
and broadly across the whole study area while built-up/slope are much more
localized, the largest-weighted, broadest-varying term (rainfall) dominated
the total variance of the index. In practice this meant the FSI map mostly
just reproduced the rainfall map — i.e. the system was effectively flagging
"where it rained more", not "where it will flood".

Flooding requires BOTH rainfall AND surface/terrain vulnerability. This
version separates the two explicitly:

    vulnerability = f(built-up fraction, slope, water/wetland/mangrove)   [static]
    FSI = rainfall_factor(for the selected time window) * vulnerability   [dynamic]

An elevated, well-drained, low-imperviousness cell now scores low FSI even
under heavy rain (vulnerability multiplies the rain contribution toward
zero) — that's the correct behavior: "avoid flood risk", not "avoid rain".
"""

import numpy as np
import rasterio

from . import config


def normalize(arr, mask):
    v = arr[mask]
    rng = v.max() - v.min()
    if rng < 1e-9:
        return np.zeros_like(arr, dtype=np.float32)
    return np.clip((arr - v.min()) / (rng + 1e-9), 0, 1)


def compute_vulnerability(built_up, slope_deg, water_wetland_mangrove, valid_mask):
    """
    Static layer — depends only on terrain/surface, never on rainfall.
    Compute this ONCE per study area and cache it; it does not need to be
    recomputed per event or per time window.
    """
    w = config.VULNERABILITY_WEIGHTS

    built_up_norm = normalize(built_up, valid_mask)
    slope_norm = normalize(slope_deg, valid_mask)
    water_frac = np.clip(water_wetland_mangrove, 0, 1)

    low_slope_score = 1 - slope_norm

    vulnerability = (
        w["built_up"] * built_up_norm
        + w["low_slope"] * low_slope_score
        - w["water_buffer"] * water_frac
    )
    return np.clip(vulnerability, 0, 1)


def compute_fsi(rainfall_grid, vulnerability, valid_mask, vulnerability_floor=0.05):
    """
    Combines a (possibly time-windowed) rainfall grid with the precomputed,
    static vulnerability layer multiplicatively.

    vulnerability_floor: a small non-zero baseline so that even the least
    vulnerable land isn't rendered as *exactly* zero risk under extreme
    rainfall. Kept small (default 0.05) so it doesn't reintroduce the
    "rainfall alone drives everything" problem this rewrite is fixing.
    """
    rainfall_factor = normalize(rainfall_grid, valid_mask)

    effective_vulnerability = vulnerability_floor + (1 - vulnerability_floor) * vulnerability
    fsi = rainfall_factor * effective_vulnerability
    fsi = np.clip(fsi, 0, 1)

    fsi_cat = np.digitize(fsi, config.FSI_RISK_BINS) - 1
    fsi_cat = np.where(valid_mask, fsi_cat, -1)
    fsi_out = np.where(valid_mask, fsi, config.NODATA_VAL)

    return fsi_out, fsi_cat


def save_raster(array, valid_mask, transform, crs, out_path, band_name, apply_nodata_mask=True):
    height, width = array.shape
    out = np.where(valid_mask, array, config.NODATA_VAL) if apply_nodata_mask else array

    with rasterio.open(
        out_path, "w", driver="GTiff", height=height, width=width,
        count=1, dtype="float32", crs=crs, transform=transform,
        nodata=config.NODATA_VAL,
    ) as dst:
        dst.write(out.astype(np.float32), 1)
        dst.set_band_description(1, band_name)

    return out_path


def save_fsi_raster(fsi, valid_mask, transform, crs, out_path):
    return save_raster(fsi, valid_mask, transform, crs, out_path, "flood_susceptibility_index")


def load_raster_band(path, band=1):
    with rasterio.open(path) as src:
        return src.read(band), src.nodata


def summarize_fsi(fsi, fsi_cat, valid_mask):
    total_valid = int(valid_mask.sum())
    summary = {
        "min": float(fsi[valid_mask].min()) if total_valid else 0.0,
        "max": float(fsi[valid_mask].max()) if total_valid else 0.0,
        "mean": float(fsi[valid_mask].mean()) if total_valid else 0.0,
        "category_counts": {},
    }
    for code, label in enumerate(config.FSI_RISK_LABELS):
        n = int((fsi_cat == code).sum())
        summary["category_counts"][label] = {
            "count": n,
            "pct": round(100 * n / total_valid, 2) if total_valid else 0.0,
        }
    return summary
