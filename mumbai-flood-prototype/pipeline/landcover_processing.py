"""
Land-cover feature loading.
Assumes landcover_features.tif already exists (already generated in Colab):
  Band 1 = built_up_fraction
  Band 2 = water_wetland_mangrove_fraction
Both bands are already aligned to the DEM's 30 m grid.
"""

import numpy as np
import rasterio

from . import config


def load_landcover_features(path=config.LANDCOVER_FEATURES_TIF):
    """
    Returns
    -------
    built_up : np.ndarray
    water_wetland_mangrove : np.ndarray
    lc_nodata : nodata value used in this raster
    """
    with rasterio.open(path) as lc:
        built_up = lc.read(1)
        water_wetland_mangrove = lc.read(2)
        lc_nodata = lc.nodata

    return built_up, water_wetland_mangrove, lc_nodata
