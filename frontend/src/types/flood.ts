import type { FeatureCollection, LineString, Point } from 'geojson'

export type ForecastOffset = 0 | 30 | 60 | 90 | 120 | 180
export interface RoutePoint { lat: number; lng: number }
export interface FloodCell extends RoutePoint {
  depthCm: number
  timestampOffsetMin: ForecastOffset
  id: string
  rainfallMmHr: number
  elevationM: number
  imperviousnessPct: number
}
export interface DrainageNode extends RoutePoint {
  id: string
  status: 'normal' | 'strained' | 'surcharging'
}
export interface RoadProperties {
  id: string
  name: string
  depthCm: number
}
export type FloodGrid = FeatureCollection<Point, FloodCell>
export interface DrainageEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  capacityUtilization: number
  bearing: number
}
export type DrainageEdges = FeatureCollection<LineString, DrainageEdge>
export type DrainageArrows = FeatureCollection<Point, DrainageEdge>
export type RoadNetwork = FeatureCollection<LineString, RoadProperties>
export type DrainageCollection = FeatureCollection<Point, DrainageNode>
export type RouteCollection = FeatureCollection<LineString, { kind: string }>
export type RouteMarkers = FeatureCollection<Point, { label: string }>
export interface ForecastFrame {
  cells: FloodCell[]
  grid: FloodGrid
  roads: RoadNetwork
  rainfallMmHr: number
}
export interface MockFloodData {
  frames: Record<ForecastOffset, ForecastFrame>
  drainage: DrainageCollection
  drainageEdges: DrainageEdges
  drainageArrows: DrainageArrows
}
export interface RouteResult {
  points: RoutePoint[]
  roadIds: string[]
  distanceKm: number
  cost: number
}
export type MapMode = 'inspect' | 'route'
