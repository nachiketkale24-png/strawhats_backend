import type { RoadNetwork, RoutePoint, RouteResult } from '../types/flood'

const key = (point: RoutePoint) => `${point.lng},${point.lat}`
export function distanceKm(a: RoutePoint, b: RoutePoint): number {
  const rad = Math.PI / 180
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

function endpoints(network: RoadNetwork): Map<string, RoutePoint> {
  const points = new Map<string, RoutePoint>()
  for (const road of network.features) {
    for (const position of [road.geometry.coordinates[0], road.geometry.coordinates.at(-1)!]) {
      const point = { lng: position[0], lat: position[1] }
      points.set(key(point), point)
    }
  }
  return points
}

export function snapToRoad(point: RoutePoint, network: RoadNetwork): RoutePoint | null {
  let nearest: RoutePoint | null = null
  let distance = Infinity
  for (const candidate of endpoints(network).values()) {
    const next = distanceKm(point, candidate)
    if (next < distance) { nearest = candidate; distance = next }
  }
  return nearest
}

// Undirected Dijkstra over the shared road endpoints. Zero penalty gives the
// shortest-distance comparison. Depth is already cached on each road feature.
export function findRoute(start: RoutePoint, end: RoutePoint, network: RoadNetwork, floodPenalty = 8): RouteResult | null {
  const from = snapToRoad(start, network)
  const to = snapToRoad(end, network)
  if (!from || !to) return null
  const nodes = endpoints(network)
  const adjacency = new Map<string, { to: string; id: string; length: number; cost: number; points: RoutePoint[] }[]>()
  for (const road of network.features) {
    const points = road.geometry.coordinates.map(([lng, lat]) => ({ lng, lat }))
    const a = key(points[0])
    const b = key(points.at(-1)!)
    const length = points.slice(1).reduce((total, point, index) => total + distanceKm(points[index], point), 0)
    const cost = length * (1 + floodPenalty * (Math.max(0, road.properties.depthCm) / 15) ** 2)
    const edge = { id: road.properties.id, length, cost }
    adjacency.set(a, [...(adjacency.get(a) ?? []), { ...edge, to: b, points }])
    adjacency.set(b, [...(adjacency.get(b) ?? []), { ...edge, to: a, points: [...points].reverse() }])
  }
  const source = key(from)
  const target = key(to)
  const unvisited = new Set(nodes.keys())
  const costs = new Map<string, number>([[source, 0]])
  const previous = new Map<string, { from: string; id: string; length: number; points: RoutePoint[] }>()
  while (unvisited.size) {
    let current: string | null = null
    let best = Infinity
    for (const node of unvisited) {
      const cost = costs.get(node) ?? Infinity
      if (cost < best) { current = node; best = cost }
    }
    if (current === null) break
    if (current === target) break
    unvisited.delete(current)
    for (const edge of adjacency.get(current) ?? []) {
      if (unvisited.has(edge.to) && best + edge.cost < (costs.get(edge.to) ?? Infinity)) {
        costs.set(edge.to, best + edge.cost)
        previous.set(edge.to, { from: current, id: edge.id, length: edge.length, points: edge.points })
      }
    }
  }
  if (!costs.has(target)) return null
  const legs: { id: string; length: number; points: RoutePoint[] }[] = []
  let cursor = target
  while (cursor !== source) {
    const leg = previous.get(cursor)
    if (!leg) return null
    legs.unshift(leg)
    cursor = leg.from
  }
  return {
    points: legs.length ? legs.flatMap((leg, index) => index === 0 ? leg.points : leg.points.slice(1)) : [from],
    roadIds: legs.map((leg) => leg.id), distanceKm: legs.reduce((total, leg) => total + leg.length, 0), cost: costs.get(target)!,
  }
}
