import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fromFile } from 'geotiff'
import { projectRaster } from '../src/lib/rasterProjection.ts'

const source = '../mumbai-flood-prototype/data/processed/flood_risk_2017-08-29.tif'
const tiff = await fromFile(source)
try {
  const image = await tiff.getImage()
  const values = await image.readRasters({ samples: [0], interleave: true })
  const bounds = image.getBoundingBox()
  const projected = projectRaster(values, image.getWidth(), image.getHeight(), bounds)
  const reference = spawnSync('../mumbai-flood-prototype/.venv/Scripts/python.exe', ['-c', `
import sys, json, numpy as np, rasterio
from rasterio.warp import reproject, transform_bounds, Resampling
from rasterio.transform import from_bounds
options = json.load(sys.stdin)
with rasterio.open(options['source']) as src:
    bounds = transform_bounds(src.crs, 'EPSG:3857', *src.bounds)
    dst = np.empty((options['height'], options['width']), dtype='float32')
    reproject(rasterio.band(src, 1), dst, src_transform=src.transform, src_crs=src.crs,
              dst_transform=from_bounds(*bounds, options['width'], options['height']),
              dst_crs='EPSG:3857', resampling=Resampling.nearest, dst_nodata=src.nodata)
    sys.stdout.buffer.write(dst.tobytes())
`], { input: JSON.stringify({ source, width: projected.width, height: projected.height }), maxBuffer: 16 * 1024 * 1024 })
  if (reference.error) throw reference.error
  assert.equal(reference.status, 0, reference.stderr?.toString())
  assert.equal(reference.stdout.byteLength, projected.values.byteLength)
  const expected = new Float32Array(reference.stdout.buffer.slice(reference.stdout.byteOffset, reference.stdout.byteOffset + reference.stdout.byteLength))
  let mismatches = 0
  for (let i = 0; i < expected.length; i++) if (Math.abs(projected.values[i] - expected[i]) > 1e-6) mismatches++
  assert.equal(mismatches, 0, `Pixel mismatch against GDAL: ${mismatches}`)
  console.log(`PASS: ${expected.length} display pixels agree with Rasterio/GDAL EPSG:3857 nearest-neighbor reprojection.`)
} finally { await tiff.close() }
