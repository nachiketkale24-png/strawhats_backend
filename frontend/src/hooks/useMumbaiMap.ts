import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { MUMBAI_BOUNDS } from '../config/mumbai'
import { addEventLayers } from '../lib/eventLayers'

// MapLibre 6 needs an explicit bundled worker URL when used with Vite.
maplibregl.setWorkerUrl(workerUrl)

export function useMumbaiMap(
  containerRef: RefObject<HTMLDivElement>,
  mapRef: MutableRefObject<maplibregl.Map | null>,
  setReady: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  useEffect(() => {
    if (!containerRef.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [72.8777, 19.076], zoom: 11, minZoom: 10,
        maxBounds: MUMBAI_BOUNDS,
        maxPitch: 60,
      })
    } catch {
      setError('Map could not initialize. Check that WebGL is enabled in your browser.')
      return
    }
    mapRef.current = map
    const onError = (e: maplibregl.ErrorEvent) => console.warn('MapLibre resource warning:', e)
    const onLoad = () => {
      clearTimeout(loadTimeout)
      map.setProjection({ type: 'mercator' })
      if (!map.getSource('esri-imagery')) map.addSource('esri-imagery', {
        type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      })
      // Keep both basemaps in the style; visibility switches do not reload the style.
      if (!map.getLayer('satellite-imagery')) map.addLayer({
        id: 'satellite-imagery', type: 'raster', source: 'esri-imagery',
        layout: { visibility: 'none' },
      })
      if (!map.getSource('openfreemap')) map.addSource('openfreemap', { type: 'vector', url: 'https://tiles.openfreemap.org/planet' })
      if (!map.getLayer('mumbai-buildings-3d')) map.addLayer({
        id: 'mumbai-buildings-3d', type: 'fill-extrusion', source: 'openfreemap',
        'source-layer': 'building', minzoom: 13,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0],
            0, '#1a1a2e', 20, '#16213e', 50, '#0f3460', 120, '#533483', 300, '#e94560'],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, ['coalesce', ['get', 'render_height'], 0]],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, ['coalesce', ['get', 'render_min_height'], 0]],
          'fill-extrusion-opacity': 1,
          'fill-extrusion-vertical-gradient': true,
        },
      })

      addEventLayers(map)
      setError(null)
      setReady(true)
    }
    const loadTimeout = setTimeout(() => setError('Map loading is taking longer than expected. Check your connection and reload.'), 20000)
    map.on('error', onError)
    map.on('load', onLoad)
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(containerRef.current)
    return () => {
      clearTimeout(loadTimeout)
      map.off('error', onError)
      map.off('load', onLoad)
      resize.disconnect()
      mapRef.current = null
      map.remove()
    }
  }, [containerRef, mapRef, setReady, setError])
}
