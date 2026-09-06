import type { Map } from 'maplibre-gl'
import type { MockFloodData } from '../types/flood'

export function addDrainageEdges(map: Map, data: MockFloodData) {
  const color = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (!map.getSource('drainage-edges')) map.addSource('drainage-edges', { type: 'geojson', promoteId: 'id', data: data.drainageEdges })
  if (!map.getLayer('drainage-edges')) map.addLayer({
    id: 'drainage-edges', type: 'line', source: 'drainage-edges',
    paint: {
      'line-color': ['interpolate', ['linear'], ['get', 'capacityUtilization'], 0, color('--status-normal'), 0.7, color('--capacity-amber'), 1, color('--capacity-red')],
      'line-width': 3.5,
      'line-dasharray': ['case', ['>', ['get', 'capacityUtilization'], 0.85], ['literal', [2, 1.5]], ['literal', [1, 0]]],
    },
  })
  if (!map.hasImage('drainage-flow-arrow')) {
    const canvas = document.createElement('canvas')
    canvas.width = 24; canvas.height = 24
    const context = canvas.getContext('2d')!
    context.beginPath()
    context.moveTo(12, 2); context.lineTo(21, 21); context.lineTo(12, 16); context.lineTo(3, 21); context.closePath()
    context.fillStyle = color('--text-primary'); context.fill()
    context.strokeStyle = color('--bg-primary'); context.lineWidth = 2; context.stroke()
    map.addImage('drainage-flow-arrow', context.getImageData(0, 0, 24, 24))
  }
  if (!map.getSource('drainage-arrows')) map.addSource('drainage-arrows', { type: 'geojson', promoteId: 'id', data: data.drainageArrows })
  if (!map.getLayer('drainage-arrows')) map.addLayer({
    id: 'drainage-arrows', type: 'symbol', source: 'drainage-arrows',
    layout: { 'icon-image': 'drainage-flow-arrow', 'icon-size': 0.75, 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true },
  })
}
