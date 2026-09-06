import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { Box, Layers, Satellite } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import MapControls from './MapControls'
import Legend from './Legend'
import ForecastSlider from './ForecastSlider'
import RainfallPanel from './RainfallPanel'
import RoutePanel from './RoutePanel'
import { mockFlood } from '../data/mockFlood'
import { updateForecast, updateRoute } from '../lib/floodLayers'
import { findRoute, snapToRoad } from '../lib/routing'
import { useMapInteractions } from '../hooks/useMapInteractions'
import type { ForecastOffset, MapMode, RoutePoint } from '../types/flood'

import { useMumbaiMap } from '../hooks/useMumbaiMap'
import Panel, { PanelCaption } from './ui/Panel'
import PanelMotion from './ui/PanelMotion'

export default function MumbaiFloodMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [satellite, setSatellite] = useState(false)
  const [threeD, setThreeD] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState<ForecastOffset>(0)
  const [mode, setMode] = useState<MapMode>('inspect')
  const [points, setPoints] = useState<RoutePoint[]>([])
  const frame = mockFlood.frames[offset]
  const start = points[0] ?? null
  const end = points[1] ?? null
  const route = useMemo(() => start && end ? findRoute(start, end, frame.roads) : null, [start, end, frame.roads])
  const shortest = useMemo(() => start && end ? findRoute(start, end, frame.roads, 0) : null, [start, end, frame.roads])
  const onPick = useCallback((point: RoutePoint) => {
    const snapped = snapToRoad(point, mockFlood.frames[0].roads)
    if (snapped) setPoints((previous) => previous.length === 1 ? [...previous, snapped] : [snapped])
  }, [])
  useMapInteractions(mapRef, ready, mode, offset, onPick)

  useMumbaiMap(containerRef, mapRef, setReady, setError)

  useEffect(() => {
    if (ready && mapRef.current) updateForecast(mapRef.current, frame)
  }, [ready, frame])

  useEffect(() => {
    if (ready && mapRef.current) updateRoute(mapRef.current, start, end, route)
  }, [ready, start, end, route])

  useEffect(() => {
    if (!ready) return
    mapRef.current?.setLayoutProperty('satellite-imagery', 'visibility', satellite ? 'visible' : 'none')
  }, [satellite, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setLayoutProperty('mumbai-buildings-3d', 'visibility', threeD ? 'visible' : 'none')
    map.easeTo({ pitch: threeD ? 55 : 0, bearing: threeD ? -15 : 0,
      ...(threeD ? { zoom: Math.max(map.getZoom(), 14.5) } : {}), duration: 700 })
  }, [threeD, ready])

  const toggleClass = 'hud-button flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-xs'

  return (
    <section className="relative h-full w-full bg-[var(--bg-secondary)]" aria-label="Mumbai flood nowcast map">
      <div ref={containerRef} className="absolute inset-0" />
      <AnimatePresence>
      <PanelMotion key="left-stack" className="absolute left-4 top-4 z-10 flex w-64 flex-col gap-3">
        <RainfallPanel rainfallMmHr={frame.rainfallMmHr} offset={offset} />
        <Legend />
        {(!ready || error) && <Panel><div role="status"><PanelCaption>{error ?? 'Loading Mumbai map…'}</PanelCaption></div></Panel>}
      </PanelMotion>
      <PanelMotion key="right-stack" className="absolute right-4 top-4 z-10 flex w-64 flex-col gap-3">
      <div className="flex gap-2">
        <button type="button" disabled={!ready} aria-pressed={satellite} aria-label="Satellite imagery" className={toggleClass} onClick={() => setSatellite((value) => !value)}>
          {satellite ? <Satellite size={16} /> : <Layers size={16} />}Satellite
        </button>
        <button type="button" disabled={!ready} aria-pressed={threeD} aria-label="3D buildings" title="Buildings appear above zoom 13" className={toggleClass} onClick={() => setThreeD((value) => !value)}>
          <Box size={16} />3D
        </button>
      </div>
      <RoutePanel mode={mode} onModeChange={setMode} start={start} end={end} route={route} shortest={shortest} onClear={() => setPoints([])} disabled={!ready} />
      </PanelMotion>
      <ForecastSlider key="forecast" offset={offset} onChange={setOffset} disabled={!ready} />
      </AnimatePresence>
      <MapControls mapRef={mapRef} />
    </section>
  )
}
