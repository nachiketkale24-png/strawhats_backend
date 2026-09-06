import type { ExpressionSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { ForecastFrame, MockFloodData, RouteCollection, RouteMarkers, RoutePoint, RouteResult } from '../types/flood'
import { addHeatmapLayers } from './heatmapLayers'
import { addDrainageEdges } from './drainageLayers'

function color(variable: string) { return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() }
export function addFloodLayers(map: Map, data: MockFloodData) {
  const depthColor: ExpressionSpecification = ['interpolate', ['linear'], ['get', 'depthCm'],
    0, color('--depth-low'), 5, color('--depth-yellow'), 15, color('--depth-orange'), 30, color('--depth-red')]
  if (!map.getSource('flood-grid')) map.addSource('flood-grid', { type: 'geojson', promoteId: 'id', data: data.frames[0].grid })
  addHeatmapLayers(map)
  if (!map.getSource('mumbai-roads')) map.addSource('mumbai-roads', { type: 'geojson', data: data.frames[0].roads })
  if (!map.getLayer('roads-flood')) map.addLayer({ id: 'roads-flood', type: 'line', source: 'mumbai-roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': depthColor, 'line-width': 4 } })
  addDrainageEdges(map, data)
  if (!map.getSource('drainage-nodes')) map.addSource('drainage-nodes', { type: 'geojson', promoteId: 'id', data: data.drainage })
  if (!map.getLayer('drainage-nodes')) map.addLayer({ id: 'drainage-nodes', type: 'circle', source: 'drainage-nodes', paint: {
    'circle-color': ['match', ['get', 'status'], 'normal', color('--status-normal'), 'strained', color('--capacity-amber'), color('--capacity-red')],
    'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': color('--bg-primary'),
  } })
  if (!map.getSource('route-line')) map.addSource('route-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  if (!map.getLayer('route-line')) map.addLayer({ id: 'route-line', type: 'line', source: 'route-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color('--cyan-primary'), 'line-width': 5, 'line-opacity': 0.9 } })
  if (!map.getSource('route-points')) map.addSource('route-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  if (!map.getLayer('route-points')) map.addLayer({ id: 'route-points', type: 'circle', source: 'route-points', paint: { 'circle-color': color('--bg-primary'), 'circle-radius': 10, 'circle-stroke-width': 3, 'circle-stroke-color': color('--cyan-primary') } })
  if (!map.getLayer('route-labels')) map.addLayer({ id: 'route-labels', type: 'symbol', source: 'route-points', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': color('--text-heading') } })
}

export function updateForecast(map: Map, frame: ForecastFrame) {
  map.getSource<GeoJSONSource>('flood-grid')?.setData(frame.grid)
  map.getSource<GeoJSONSource>('mumbai-roads')?.setData(frame.roads)
}

export function updateRoute(map: Map, start: RoutePoint | null, end: RoutePoint | null, route: RouteResult | null) {
  const line: RouteCollection = { type: 'FeatureCollection', features: route && route.points.length > 1 ? [{ type: 'Feature', properties: { kind: 'depth-weighted' }, geometry: { type: 'LineString', coordinates: route.points.map((point) => [point.lng, point.lat]) } }] : [] }
  const markers: RouteMarkers = { type: 'FeatureCollection', features: [] }
  for (const [point, label] of [[start, 'A'], [end, 'B']] as const) {
    if (point) markers.features.push({ type: 'Feature', properties: { label }, geometry: { type: 'Point', coordinates: [point.lng, point.lat] } })
  }
  map.getSource<GeoJSONSource>('route-line')?.setData(line)
  map.getSource<GeoJSONSource>('route-points')?.setData(markers)
}
