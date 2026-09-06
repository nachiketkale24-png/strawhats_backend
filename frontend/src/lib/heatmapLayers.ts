import type { Map } from 'maplibre-gl'

export function addHeatmapLayers(map: Map) {
  const color = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (!map.getLayer('flood-heatmap')) map.addLayer({
    id: 'flood-heatmap', type: 'heatmap', source: 'flood-grid', maxzoom: 14,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'depthCm'], 0, 0, 5, 0.12, 15, 0.4, 30, 0.8, 60, 1],
      // A bounded kernel avoids the large offscreen overdraw of 120–180px radii.
      'heatmap-intensity': 0.6,
      'heatmap-radius': 70,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(255,240,179,0)', 0.15, color('--heat-low'), 0.4, color('--heat-yellow'), 0.65, color('--heat-orange'), 1, color('--heat-red')],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.72, 13, 0.72, 14, 0],
    },
  })
  if (!map.getLayer('flood-hotspots')) map.addLayer({
    id: 'flood-hotspots', type: 'circle', source: 'flood-grid', minzoom: 13,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'depthCm'], 0, 3, 15, 7, 30, 10, 60, 15],
      'circle-color': ['interpolate', ['linear'], ['get', 'depthCm'], 0, color('--heat-low'), 5, color('--heat-yellow'), 15, color('--heat-orange'), 30, color('--heat-red')],
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.88],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
      'circle-stroke-color': color('--bg-primary'), 'circle-stroke-width': 1,
    },
  })
  // Heatmap density is not a feature: a transparent hit target keeps individual
  // hotspot inspection available before the visible circles fade in.
  if (!map.getLayer('flood-hotspot-hit')) map.addLayer({
    id: 'flood-hotspot-hit', type: 'circle', source: 'flood-grid',
    paint: { 'circle-radius': 18, 'circle-opacity': 0 },
  })
}
