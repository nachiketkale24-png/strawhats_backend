// MapLibre image textures are linear in Web Mercator, not in latitude.
// Sample each target pixel center back into the source geographic raster.
export type RasterBounds = [number, number, number, number]
const radians = Math.PI / 180
export function mercatorY(latitude: number) {
  return Math.log(Math.tan(Math.PI / 4 + latitude * radians / 2))
}
export function inverseMercatorY(y: number) {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / radians
}
export function projectRaster(values: ArrayLike<number>, sourceWidth: number, sourceHeight: number, bounds: RasterBounds, maxSize = 1536) {
  const [west, south, east, north] = bounds
  if (!(west < east && south < north && south > -85.051129 && north < 85.051129)) throw new Error('Invalid raster extent for Web Mercator.')
  const top = mercatorY(north), bottom = mercatorY(south)
  const xSpan = (east - west) * radians, ySpan = top - bottom
  const longest = Math.min(maxSize, Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(longest * xSpan / Math.max(xSpan, ySpan)))
  const height = Math.max(1, Math.round(longest * ySpan / Math.max(xSpan, ySpan)))
  const projected = new Float32Array(width * height)
  for (let row = 0; row < height; row++) {
    const latitude = inverseMercatorY(top - (row + 0.5) / height * ySpan)
    const sourceRow = Math.min(sourceHeight - 1, Math.max(0, Math.floor((north - latitude) / (north - south) * sourceHeight)))
    for (let col = 0; col < width; col++) {
      const sourceCol = Math.min(sourceWidth - 1, Math.floor((col + 0.5) / width * sourceWidth))
      projected[row * width + col] = Number(values[sourceRow * sourceWidth + sourceCol])
    }
  }
  return { values: projected, width, height }
}
