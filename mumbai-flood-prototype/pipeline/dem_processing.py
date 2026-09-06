"""
DEM loading, cleaning, and slope derivation.
Assumes mumbai_dem_clipped.tif already exists (already generated in Colab).
"""

import numpy as np
import rasterio

from . import config


def load_and_clean_dem(clipped_path=config.DEM_CLIPPED_TIF):
    """
    Load the clipped DEM, mask NoData, and remove physically implausible
    low-elevation pixels (sensor artifacts, not real Mumbai terrain).

    Returns
    -------
    dem_clean : np.ndarray (float32) with NODATA_VAL where invalid
    transform : affine transform of the raster
    crs       : CRS object
    valid_mask: boolean array, True where data is valid
    """
    with rasterio.open(clipped_path) as src:
        dem = src.read(1).astype(np.float32)
        transform = src.transform
        crs = src.crs
        src_nodata = src.nodata

    valid = (dem != src_nodata) if src_nodata is not None else np.ones_like(dem, dtype=bool)
    implausible = valid & (dem < config.IMPLAUSIBLE_LOW_ELEVATION)

    dem_clean = dem.copy()
    if src_nodata is not None:
        dem_clean[dem == src_nodata] = config.NODATA_VAL
    dem_clean[implausible] = config.NODATA_VAL

    valid_mask = dem_clean != config.NODATA_VAL

    return dem_clean, transform, crs, valid_mask


def compute_slope_degrees(dem_clean, valid_mask, transform):
    """
    Derive slope (degrees) via numpy.gradient — deliberately avoids
    richdem/whitebox after their Colab installation issues.
    """
    pixel_size_deg = transform.a
    mean_lat = transform.f + (dem_clean.shape[0] / 2) * transform.e
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * np.cos(np.radians(mean_lat))

    dem_for_grad = np.where(valid_mask, dem_clean, np.nan)
    dzdy, dzdx = np.gradient(
        dem_for_grad,
        pixel_size_deg * m_per_deg_lat,
        pixel_size_deg * m_per_deg_lon,
    )
    slope_rad = np.arctan(np.sqrt(dzdx ** 2 + dzdy ** 2))
    slope_deg = np.degrees(slope_rad)
    slope_deg = np.nan_to_num(slope_deg, nan=0.0)

    return slope_deg


def get_dem_grid_coords(dem_shape, transform):
    """
    Compute pixel-center lon/lat arrays directly from the affine transform.
    Deliberately avoids rasterio.transform.xy, which silently flattens
    2D row/col arrays and caused a shape-mismatch bug earlier.
    """
    rows, cols = np.indices(dem_shape)
    grid_lon = transform.c + (cols + 0.5) * transform.a
    grid_lat = transform.f + (rows + 0.5) * transform.e
    return grid_lon, grid_lat
