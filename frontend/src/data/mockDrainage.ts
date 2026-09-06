import { pointWithinMumbai } from '../config/mumbai.ts'
import type { DrainageArrows, DrainageEdges, DrainageNode } from '../types/flood'

function node(id: string, x: number, y: number, status: DrainageNode['status']): DrainageNode {
  return { id, ...pointWithinMumbai(x, y), status }
}

// Relative positions use the very same extent as the map. Existing locations
// remain on Mumbai land; north/south branches extend the demo's city coverage.
export const drainageNodes: DrainageNode[] = [
  node('Dadar', 0.3875, 0.3733333333, 'strained'),
  node('Hindmata', 0.4, 0.3533333333, 'surcharging'),
  node('Bandra', 0.3791666667, 0.4555555556, 'normal'),
  node('Kurla', 0.5416666667, 0.4933333333, 'surcharging'),
  node('Andheri', 0.4, 0.5977777778, 'strained'),
  node('Goregaon', 0.4166666667, 0.6977777778, 'normal'),
  node('Ghatkopar', 0.6583333333, 0.5244444444, 'strained'),
  node('Bhandup', 0.7791666667, 0.6688888889, 'normal'),
  node('Dahisar', 0.4791666667, 0.9222222222, 'normal'),
  node('Borivali', 0.4541666667, 0.8555555556, 'strained'),
  node('Colaba', 0.2666666667, 0.1266666667, 'strained'),
]

// Directed demo DAG: tributaries merge toward southern outfalls.
export const drainageAdjacency: Record<string, { toNodeId: string; capacityUtilization: number }[]> = {
  Dahisar: [{ toNodeId: 'Borivali', capacityUtilization: 0.32 }],
  Borivali: [{ toNodeId: 'Goregaon', capacityUtilization: 0.64 }],
  Goregaon: [{ toNodeId: 'Andheri', capacityUtilization: 0.43 }],
  Andheri: [{ toNodeId: 'Bandra', capacityUtilization: 0.79 }],
  Bandra: [{ toNodeId: 'Dadar', capacityUtilization: 0.56 }],
  Dadar: [{ toNodeId: 'Hindmata', capacityUtilization: 0.91 }],
  Bhandup: [{ toNodeId: 'Ghatkopar', capacityUtilization: 0.48 }],
  Ghatkopar: [{ toNodeId: 'Kurla', capacityUtilization: 0.83 }],
  Kurla: [{ toNodeId: 'Hindmata', capacityUtilization: 0.96 }],
  Hindmata: [{ toNodeId: 'Colaba', capacityUtilization: 0.88 }],
  Colaba: [],
}

export function generateDrainageGraph(): { drainageEdges: DrainageEdges; drainageArrows: DrainageArrows } {
  const drainageEdges: DrainageEdges = { type: 'FeatureCollection', features: [] }
  const drainageArrows: DrainageArrows = { type: 'FeatureCollection', features: [] }
  const byId = new Map(drainageNodes.map((entry) => [entry.id, entry]))
  for (const [fromNodeId, downstream] of Object.entries(drainageAdjacency)) {
    for (const { toNodeId, capacityUtilization } of downstream) {
      const from = byId.get(fromNodeId)!
      const to = byId.get(toNodeId)!
      const rad = Math.PI / 180
      const deltaLng = (to.lng - from.lng) * rad
      const y = Math.sin(deltaLng) * Math.cos(to.lat * rad)
      const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(deltaLng)
      const bearing = (Math.atan2(y, x) / rad + 360) % 360
      const id = `${fromNodeId}-${toNodeId}`
      const properties = { id, fromNodeId, toNodeId, capacityUtilization, bearing }
      drainageEdges.features.push({ type: 'Feature', id, properties, geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] } })
      drainageArrows.features.push({ type: 'Feature', id, properties, geometry: { type: 'Point', coordinates: [(from.lng + to.lng) / 2, (from.lat + to.lat) / 2] } })
    }
  }
  return { drainageEdges, drainageArrows }
}
