import { useEffect } from 'react'
import type { RefObject } from 'react'
import { Popup } from 'maplibre-gl'
import type { Map, MapMouseEvent } from 'maplibre-gl'
import { mockFlood } from '../data/mockFlood'
import type { ForecastOffset, MapMode, RoutePoint } from '../types/flood'

export function useMapInteractions(mapRef: RefObject<Map | null>, ready: boolean, mode: MapMode, offset: ForecastOffset, onPick: (point: RoutePoint) => void) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let popup: Popup | null = null
    const interactiveLayers = ['drainage-nodes', 'drainage-arrows', 'drainage-edges', 'flood-hotspot-hit']
    const enter = () => { map.getCanvas().style.cursor = mode === 'route' ? 'crosshair' : 'pointer' }
    const leave = () => { map.getCanvas().style.cursor = mode === 'route' ? 'crosshair' : '' }
    leave()
    const click = (event: MapMouseEvent) => {
      popup?.remove()
      if (mode === 'route') {
        onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng })
        return
      }
      // Prefer nodes, then edges, then the nearest hotspot under its hit target.
      const hits = map.queryRenderedFeatures(event.point, { layers: interactiveLayers })
      const feature = hits.find((hit) => hit.layer.id === 'drainage-nodes')
        ?? hits.find((hit) => hit.layer.id === 'drainage-edges' || hit.layer.id === 'drainage-arrows')
        ?? hits.filter((hit) => hit.geometry.type === 'Point').sort((a, b) => {
          if (a.geometry.type !== 'Point' || b.geometry.type !== 'Point') return 0
          const aPoint = map.project([a.geometry.coordinates[0], a.geometry.coordinates[1]])
          const bPoint = map.project([b.geometry.coordinates[0], b.geometry.coordinates[1]])
          return aPoint.dist(event.point) - bPoint.dist(event.point)
        })[0]
      if (!feature) return
      const content = document.createElement('div')
      content.className = 'inspection-content'
      // Read typed records by feature ID instead of trusting untyped properties.
      if (feature.layer.id === 'drainage-nodes') {
        const node = mockFlood.drainage.features.find((entry) => entry.id === feature.id)?.properties
        if (!node) return
        content.textContent = `${node.id}\nDrainage: ${node.status}\n${node.lat.toFixed(4)}, ${node.lng.toFixed(4)}\nStatic mock status`
      } else if (feature.layer.id === 'drainage-edges' || feature.layer.id === 'drainage-arrows') {
        const edge = mockFlood.drainageEdges.features.find((entry) => entry.id === feature.id)?.properties
        if (!edge) return
        content.textContent = `Drainage flow\n${edge.fromNodeId} → ${edge.toNodeId}\nCapacity utilization: ${Math.round(edge.capacityUtilization * 100)}%\n${edge.capacityUtilization > 0.85 ? 'Near overflow' : 'Within capacity'}\nMock drainage connection`
      } else {
        const cell = mockFlood.frames[offset].cells.find((entry) => entry.id === feature.id)
        if (!cell) return
        content.textContent = `Flood depth: ${cell.depthCm} cm\nRainfall: ${cell.rainfallMmHr} mm/hr\nElevation: ${cell.elevationM} m\nImperviousness: ${cell.imperviousnessPct}%\nForecast: +${cell.timestampOffsetMin} min\n${cell.lat.toFixed(4)}, ${cell.lng.toFixed(4)}\nSynthetic demo inputs`
      }
      popup = new Popup({ maxWidth: '300px' }).setLngLat(event.lngLat).setDOMContent(content).addTo(map)
    }
    map.on('click', click)
    for (const layer of interactiveLayers) {
      map.on('mouseenter', layer, enter)
      map.on('mouseleave', layer, leave)
    }
    return () => {
      popup?.remove()
      map.off('click', click)
      for (const layer of interactiveLayers) {
        map.off('mouseenter', layer, enter)
        map.off('mouseleave', layer, leave)
      }
      map.getCanvas().style.cursor = ''
    }
  }, [mapRef, ready, mode, offset, onPick])
}
