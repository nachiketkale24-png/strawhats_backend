import type { RoutePoint } from '../types/flood'

// Single geographic extent for the map, hotspot sampling, and drainage data.
export const MUMBAI_BOUNDS: [[number, number], [number, number]] = [[72.75, 18.85], [72.99, 19.30]]

export function pointWithinMumbai(x: number, y: number): RoutePoint {
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new RangeError('Mumbai coordinates must be normalized to 0–1')
  const [[west, south], [east, north]] = MUMBAI_BOUNDS
  return { lng: Number((west + x * (east - west)).toFixed(6)), lat: Number((south + y * (north - south)).toFixed(6)) }
}
