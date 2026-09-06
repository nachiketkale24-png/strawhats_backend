import type { FloodCell, ForecastFrame, ForecastOffset, MockFloodData, RoadNetwork, RoutePoint } from '../types/flood'
import { MUMBAI_BOUNDS } from '../config/mumbai.ts'
import { drainageNodes, generateDrainageGraph } from './mockDrainage.ts'

export const FORECAST_OFFSETS: ForecastOffset[] = [0, 30, 60, 90, 120, 180]
export const GRID_SUBDIVISIONS = 40
export const RAINFALL: Record<ForecastOffset, number> = { 0: 18, 30: 32, 60: 51, 90: 76, 120: 62, 180: 26 }

// A connected 17-segment approximation, not live OSM or a navigable street map.
// Shared endpoints allow the routing graph and colored roads to use the same data.
const junctions: RoutePoint[][] = [
  [{ lat: 19.018, lng: 72.835 }, { lat: 19.025, lng: 72.865 }, { lat: 19.040, lng: 72.900 }],
  [{ lat: 19.075, lng: 72.838 }, { lat: 19.075, lng: 72.869 }, { lat: 19.085, lng: 72.908 }],
  [{ lat: 19.130, lng: 72.845 }, { lat: 19.130, lng: 72.875 }, { lat: 19.135, lng: 72.930 }],
  [{ lat: 19.200, lng: 72.855 }, { lat: 19.200, lng: 72.875 }, { lat: 19.190, lng: 72.950 }],
]
const coordinate = (point: RoutePoint): [number, number] => [point.lng, point.lat]
const baseRoads: RoadNetwork = { type: 'FeatureCollection', features: [] }
function addRoad(name: string, start: RoutePoint, end: RoutePoint) {
  const id = `road-${baseRoads.features.length}`
  baseRoads.features.push({ type: 'Feature', id, properties: { id, name, depthCm: 0 }, geometry: { type: 'LineString', coordinates: [coordinate(start), coordinate(end)] } })
}
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    addRoad(['SV Road', 'Western Express Highway', row === 0 ? 'Eastern Express Highway' : 'LBS Marg'][col], junctions[row][col], junctions[row + 1][col])
  }
}
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 2; col++) {
    addRoad(['Sion–Dharavi Link Road', 'Santacruz–Chembur Link Road', 'Jogeshwari–Vikhroli Link Road', 'Goregaon–Mulund Link Road'][row], junctions[row][col], junctions[row][col + 1])
  }
}

export function generateMockFlood(): MockFloodData {
  const frames = {} as Record<ForecastOffset, ForecastFrame>
  const [[west, south], [east, north]] = MUMBAI_BOUNDS
  for (const offset of FORECAST_OFFSETS) {
    const cells: FloodCell[] = []
    for (let row = 0; row < GRID_SUBDIVISIONS; row++) {
      for (let col = 0; col < GRID_SUBDIVISIONS; col++) {
        const lng = west + (col + 0.5) * ((east - west) / GRID_SUBDIVISIONS)
        const lat = south + (row + 0.5) * ((north - south) / GRID_SUBDIVISIONS)
        const basin = Math.exp(-(((lng - 72.87) / 0.026) ** 2 + ((lat - 19.08) / 0.07) ** 2))
        const elevationM = Number((2 + (1 - basin) * 19 + ((row + col) % 4)).toFixed(1))
        const imperviousnessPct = Math.round(45 + basin * 48)
        const rainfallMmHr = Number((RAINFALL[offset] * (0.8 + basin * 0.4)).toFixed(1))
        // Illustrative runoff formula only. All displayed inputs participate in depth.
        const depthCm = Number(Math.max(0, rainfallMmHr * imperviousnessPct / 100 * 0.85 - elevationM * 0.75).toFixed(1))
        cells.push({ id: `cell-${row}-${col}`, lat, lng, depthCm, timestampOffsetMin: offset, rainfallMmHr, elevationM, imperviousnessPct })
      }
    }
    const roads: RoadNetwork = {
      type: 'FeatureCollection',
      features: baseRoads.features.map((road) => {
        const [a, b] = road.geometry.coordinates
        const lng = (a[0] + b[0]) / 2
        const lat = (a[1] + b[1]) / 2
        // Once per segment per forecast, never in render or routing.
        const nearest = cells.reduce((best, cell) =>
          ((cell.lng - lng) * Math.cos(lat * Math.PI / 180)) ** 2 + (cell.lat - lat) ** 2 <
          ((best.lng - lng) * Math.cos(lat * Math.PI / 180)) ** 2 + (best.lat - lat) ** 2 ? cell : best)
        return { ...road, properties: { ...road.properties, depthCm: nearest.depthCm } }
      }),
    }
    frames[offset] = {
      cells, roads, rainfallMmHr: RAINFALL[offset],
      grid: {
        type: 'FeatureCollection',
        features: cells.map((cell) => ({
          type: 'Feature', id: cell.id, properties: cell,
          geometry: { type: 'Point', coordinates: [cell.lng, cell.lat] },
        })),
      },
    }
  }
  return {
    frames,
    ...generateDrainageGraph(),
    drainage: { type: 'FeatureCollection', features: drainageNodes.map((node) => ({ type: 'Feature', id: node.id, properties: node, geometry: { type: 'Point', coordinates: coordinate(node) } })) },
  }
}

// Generate once on module load; a future API adapter can return this same shape.
export const mockFlood = generateMockFlood()
