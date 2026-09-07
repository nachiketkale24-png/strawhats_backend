import { useEffect, useRef, useState } from 'react'
import { Popup } from 'maplibre-gl'
import type { Map, MapMouseEvent } from 'maplibre-gl'
import { Box, Layers, Satellite } from 'lucide-react'
import MapControls from './MapControls'
import { useMumbaiMap } from '../hooks/useMumbaiMap'
import Panel, { PanelCaption, PanelLabel } from './ui/Panel'
import AddressRoutePanel from './AddressRoutePanel'
import { API_BASE, apiRequest, getEvents, getRoutes, getSummary, getWindows, windowQuery } from '../lib/floodApi'
import type { EventSummary, RouteComparison, EventWindows } from '../lib/floodApi'
import { clearCoverageOverlay, clearEventRaster, FSI_COLORS, loadCoverageOverlay, loadEventRaster, updateEventRoutes } from '../lib/eventLayers'
import type { MapMode, RoutePoint } from '../types/flood'

export default function MumbaiFloodMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const [ready, setReady] = useState(false)
  const [satellite, setSatellite] = useState(false)
  const [threeD, setThreeD] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<string[]>([])
  const [event, setEvent] = useState('')
  const [windows, setWindows] = useState<EventWindows | null>(null)
  const [minutes, setMinutes] = useState(15)
  const intervalReady = !!event && windows?.event_date === event
  const selectedMinutes = windows?.windows.length ? minutes : undefined
  const activeWindow = windows?.windows.find(window => window.minutes === minutes)
  const [refresh, setRefresh] = useState(0)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [apiError, setApiError] = useState('')
  const [summary, setSummary] = useState<EventSummary | null>(null)
  const [rasterStatus, setRasterStatus] = useState('')
  const [mode, setMode] = useState<MapMode>('inspect')
  const [points, setPoints] = useState<RoutePoint[]>([])
  const [routes, setRoutes] = useState<RouteComparison | null>(null)
  const [routeStatus, setRouteStatus] = useState('')
  useMumbaiMap(containerRef, mapRef, setReady, setError)

  useEffect(() => {
    const controller = new AbortController()
    setEventsLoading(true); setApiError(''); setEvent(''); setSummary(null); setRoutes(null)
    getEvents(controller.signal).then(dates => {
      setEvents(dates); setEvent(dates.at(-1) ?? '')
    }).catch(err => { if (!controller.signal.aborted) { setEvents([]); setApiError(`Cannot load events: ${err.message} Check that the prototype API is running.`) } })
      .finally(() => { if (!controller.signal.aborted) setEventsLoading(false) })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    const controller = new AbortController()
    setWindows(null); setMinutes(15)
    if (event) getWindows(event, controller.signal).then(info => {
      if (!controller.signal.aborted) { setWindows(info); setMinutes(info.windows[0]?.minutes ?? 15) }
    }).catch(err => { if (!controller.signal.aborted) setApiError(`Cannot load time intervals: ${err.message}`) })
    return () => controller.abort()
  }, [event, refresh])

  useEffect(() => {
    const controller = new AbortController()
    setSummary(null)
    if (intervalReady) getSummary(event, controller.signal, selectedMinutes).then(value => { if (!controller.signal.aborted) setSummary(value) }).catch(err => {
      if (!controller.signal.aborted) setApiError(`Cannot load summary: ${err.message}`)
    })
    return () => controller.abort()
  }, [event, refresh, intervalReady, selectedMinutes])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const controller = new AbortController()
    clearEventRaster(map)
    if (!intervalReady) { setRasterStatus(''); return }
    setRasterStatus('Loading flood susceptibility map…')
    Promise.all([
      loadEventRaster(event, controller.signal, selectedMinutes),
      loadCoverageOverlay(controller.signal).catch(() => null),
    ]).then(([image, coverage]) => {
      if (controller.signal.aborted) return
      map.addSource('event-fsi', { type: 'image', ...image })
      map.addLayer({ id: 'event-fsi', type: 'raster', source: 'event-fsi', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } }, 'mumbai-buildings-3d')
      if (coverage) {
        clearCoverageOverlay(map)
        map.addSource('station-coverage', { type: 'image', ...coverage })
        map.addLayer({ id: 'station-coverage', type: 'raster', source: 'station-coverage', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } }, 'mumbai-buildings-3d')
      }
      setRasterStatus('')
    }).catch(err => { if (!controller.signal.aborted) setRasterStatus(`Flood map unavailable: ${err.message}`) })
    return () => controller.abort()
  }, [ready, event, refresh, intervalReady, selectedMinutes])

  const start = points[0], end = points[1]
  useEffect(() => {
    const controller = new AbortController()
    setRoutes(null); setRouteStatus('')
    if (intervalReady && start && end) {
      setRouteStatus('Finding routes…')
      getRoutes(event, start, end, controller.signal, selectedMinutes).then(result => {
        if (!controller.signal.aborted) { setRoutes(result); setRouteStatus('') }
      }).catch(err => { if (!controller.signal.aborted) setRouteStatus(`Route unavailable: ${err.message}`) })
    }
    return () => controller.abort()
  }, [event, start, end, refresh, intervalReady, selectedMinutes])

  useEffect(() => {
    if (ready && mapRef.current) updateEventRoutes(mapRef.current, points, routes)
  }, [ready, points, routes])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !intervalReady) return
    let popup: Popup | null = null
    let request: AbortController | null = null
    map.getCanvas().style.cursor = mode === 'route' ? 'crosshair' : ''
    const click = (e: MapMouseEvent) => {
      request?.abort(); popup?.remove()
      if (mode === 'route') {
        setRoutes(null); setRouteStatus('')
        setPoints(previous => previous.length === 1 ? [...previous, { lng: e.lngLat.lng, lat: e.lngLat.lat }] : [{ lng: e.lngLat.lng, lat: e.lngLat.lat }])
        return
      }
      const controller = new AbortController()
      request = controller
      const content = document.createElement('div')
      content.className = 'inspection-content'; content.textContent = 'Loading FSI…'
      popup = new Popup().setLngLat(e.lngLat).setDOMContent(content).addTo(map)
      const query = new URLSearchParams({ lon: String(e.lngLat.lng), lat: String(e.lngLat.lat) })
      if (selectedMinutes !== undefined) query.set('window_minutes', String(selectedMinutes))
      apiRequest(`/flood/point/${encodeURIComponent(event)}?${query}`, controller.signal)
        .then(response => response.json()).then(data => {
          if (!controller.signal.aborted) {
            const windowLabel = activeWindow ? ` · ${activeWindow.start_time.slice(11,16)}–${activeWindow.end_time.slice(11,16)}` : ' · Daily'
            const fsiLabel = typeof data.fsi === 'number' && Number.isFinite(data.fsi) ? `FSI: ${data.fsi.toFixed(3)} (0–1)` : 'No flood data at this location.'
            const coverageLabel = data.in_station_network === false ? '\nLower confidence — extrapolated' : data.in_station_network === true ? '\nInside station network' : ''
            content.textContent = `${event}${windowLabel}\n${fsiLabel}${coverageLabel}`
          }
        }).catch(err => { if (!controller.signal.aborted) content.textContent = `Unable to inspect: ${err.message}` })
    }
    map.on('click', click)
    return () => { request?.abort(); popup?.remove(); map.off('click', click); map.getCanvas().style.cursor = '' }
  }, [ready, mode, event, intervalReady, selectedMinutes, activeWindow])

  useEffect(() => {
    if (ready) mapRef.current?.setLayoutProperty('satellite-imagery', 'visibility', satellite ? 'visible' : 'none')
  }, [satellite, ready])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setLayoutProperty('mumbai-buildings-3d', 'visibility', threeD ? 'visible' : 'none')
    map.easeTo({ pitch: threeD ? 55 : 0, bearing: threeD ? -15 : 0, ...(threeD ? { zoom: Math.max(map.getZoom(), 14.5) } : {}), duration: 700 })
  }, [threeD, ready])

  const disabled = !ready || !intervalReady || eventsLoading
  const buttonClass = 'hud-button flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-xs'
  return <section className="relative h-full w-full bg-[var(--bg-secondary)]" aria-label="Mumbai flood susceptibility map">
    <div ref={containerRef} className="absolute inset-0" />
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex max-h-[calc(100%_-_13rem)] flex-wrap items-start justify-between gap-3 overflow-y-auto">
      <div className="pointer-events-auto flex w-64 flex-col gap-3">
        <Panel>
          <PanelLabel>Historical rainfall event</PanelLabel>
          <select aria-label="Rainfall event" className="my-3 w-full rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] p-2 text-sm" value={event} disabled={eventsLoading || !events.length} onChange={e => { setEvent(e.target.value); setRoutes(null); setSummary(null); setApiError('') }}>
            {!events.length && <option value="">{eventsLoading ? 'Loading events…' : 'No events available'}</option>}
            {events.map(date => <option key={date} value={date}>{date}</option>)}
          </select>
          <div role="status">
            {apiError && <PanelCaption>{apiError}</PanelCaption>}
            {!eventsLoading && !apiError && !events.length && <PanelCaption>No precomputed events yet. Run the offline pipeline, then refresh.</PanelCaption>}
            {summary && <PanelCaption>FSI min {summary.fsi_min.toFixed(3)} · mean {summary.fsi_mean.toFixed(3)} · max {summary.fsi_max.toFixed(3)}</PanelCaption>}
          </div>
          <button className="hud-button mt-3 px-3 py-2 text-xs" disabled={eventsLoading} onClick={() => setRefresh(value => value + 1)}>Refresh events</button>
          {intervalReady && <a className="mt-3 block text-sm underline" href={`${API_BASE}/flood/raster/${encodeURIComponent(event)}${windowQuery(selectedMinutes)}`} download>Download FSI raster</a>}
        </Panel>
        <Panel>
          <PanelLabel>Flood susceptibility · FSI</PanelLabel>
          <div className="mt-3 space-y-2">{['Low · 0–0.25', 'Medium · 0.25–0.5', 'High · 0.5–0.75', 'Severe · 0.75–1'].map((label, index) => <div className="flex items-center gap-2 text-sm" key={label}><span className="h-3 w-3 rounded" style={{ background: FSI_COLORS[index] }} />{label}</div>)}</div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded border border-slate-400" style={{ background: 'repeating-linear-gradient(135deg, rgb(226 232 240 / 0.7) 0 2px, rgb(15 23 42 / 0.45) 2px 6px)' }} />
            Lower confidence — extrapolated
          </div>
          <PanelCaption className="mt-3">FSI is rainfall × terrain vulnerability. Hatched areas sit outside the rain-station network and are less reliable. No coverage south of 19.0°N in the supplied DEM.</PanelCaption>
        </Panel>
        {(!ready || error || rasterStatus) && <Panel><div role="status"><PanelCaption>{error || rasterStatus || 'Loading Mumbai map…'}</PanelCaption></div></Panel>}
      </div>
      <div className="pointer-events-auto flex w-64 flex-col gap-3">
        <div className="flex gap-2">
          <button disabled={!ready} aria-pressed={satellite} aria-label="Satellite imagery" className={buttonClass} onClick={() => setSatellite(value => !value)}>{satellite ? <Satellite size={16} /> : <Layers size={16} />}Satellite</button>
          <button disabled={!ready} aria-pressed={threeD} aria-label="3D buildings" className={buttonClass} onClick={() => setThreeD(value => !value)}><Box size={16} />3D</button>
        </div>
        <Panel>
          <PanelLabel>Explore Mumbai</PanelLabel>
          <div className="my-3 flex gap-2">
            <button disabled={disabled} aria-pressed={mode === 'inspect'} className={buttonClass} onClick={() => setMode('inspect')}>Inspect</button>
            <button disabled={disabled} aria-pressed={mode === 'route'} className={buttonClass} onClick={() => setMode('route')}>Pick route</button>
            <button disabled={disabled} aria-pressed={mode === 'route-address'} className={buttonClass} onClick={() => setMode('route-address')}>Address route</button>
          </div>
          <PanelCaption>{mode === 'inspect' ? 'Click the map for the event\'s FSI value.' : mode === 'route' ? (!start ? 'Pick your start point.' : !end ? 'Pick your destination.' : 'The API snaps your points to the road graph.') : 'Enter addresses to find a route.'}</PanelCaption>
          {mode === 'route-address' && (
            <AddressRoutePanel 
              onRouteFound={(s, e) => { setPoints([s, e]); setRoutes(null); setRouteStatus('') }}
              onClear={() => { setPoints([]); setRoutes(null); setRouteStatus('') }}
              disabled={disabled}
              routeStatus={routeStatus}
              hasRoute={!!routes}
            />
          )}
          {mode !== 'route-address' && points.map((point, index) => <PanelCaption className="mt-2" key={index}>{index === 0 ? 'A' : 'B'} • {point.lat.toFixed(4)}, {point.lng.toFixed(4)}</PanelCaption>)}
          {mode !== 'route-address' && <div role="status">{routeStatus && <PanelCaption className="mt-3">{routeStatus}</PanelCaption>}</div>}
          {routes && <div className="mt-3 space-y-2 text-sm" aria-live="polite">
            <p><span className="text-cyan-400">Flood-aware</span>: {(routes.flood_aware_route.length_m / 1000).toFixed(2)} km</p>
            <p><span className="text-slate-400">Shortest</span>: {(routes.normal_route.length_m / 1000).toFixed(2)} km</p>
            <PanelCaption>Extra distance: {(routes.extra_distance_m / 1000).toFixed(2)} km ({routes.extra_distance_pct.toFixed(1)}%)</PanelCaption>
            <PanelCaption>Flood-aware FSI: max {routes.flood_aware_route.max_risk.toFixed(3)}, average {routes.flood_aware_route.avg_risk.toFixed(3)}</PanelCaption>
            <PanelCaption>Shortest FSI: max {routes.normal_route.max_risk.toFixed(3)}, average {routes.normal_route.avg_risk.toFixed(3)}</PanelCaption>
          </div>}
          {start && mode !== 'route-address' && <button className="hud-button mt-3 px-3 py-2 text-xs" onClick={() => { setPoints([]); setRoutes(null); setRouteStatus('') }}>Clear route</button>}
        </Panel>
      </div>
    </div>
    <section aria-label="FSI time interval" className="absolute bottom-10 left-1/2 z-10 w-[min(94%,32rem)] -translate-x-1/2">
      <Panel>
        <PanelLabel className="mb-2 text-center">{activeWindow ? `Historical FSI ? ${minutes} minutes` : 'Historical FSI ? Daily total'}</PanelLabel>
        {activeWindow && <PanelCaption className="mb-3 text-center">{event} ? {activeWindow.start_time.slice(11, 16)}?{activeWindow.end_time.slice(11, 16)} ? workbook time</PanelCaption>}
        <div role="group" aria-label="Rainfall accumulation duration" className="grid grid-cols-6 gap-1">
          {[15, 30, 60, 90, 120, 180].map(value => <button key={value} className="hud-button px-1 py-2 text-xs" disabled={disabled || !windows?.windows.some(window => window.minutes === value)} aria-pressed={!!activeWindow && value === minutes} onClick={() => { setMinutes(value); setRoutes(null); setSummary(null); setRouteStatus('') }}>{value} min</button>)}
        </div>
        <PanelCaption className="mt-2 text-center">{activeWindow ? 'Increase the observed rainfall window from the same start time.' : '15-minute intervals are not available for this date yet. Refresh events after preprocessing.'}</PanelCaption>
      </Panel>
    </section>
    <MapControls mapRef={mapRef} />
  </section>
}
