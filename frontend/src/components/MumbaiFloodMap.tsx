import { useEffect, useRef, useState } from 'react'
import { Popup } from 'maplibre-gl'
import type { Map, MapMouseEvent } from 'maplibre-gl'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  Box,
  Calendar,
  Clock,
  Crosshair,
  Download,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation2,
  RefreshCw,
  Route,
  Satellite,
  ShieldCheck,
  X
} from 'lucide-react'
import MapControls from './MapControls'
import { useMumbaiMap } from '../hooks/useMumbaiMap'
import Panel, { PanelCaption, PanelLabel } from './ui/Panel'
import AddressRoutePanel from './AddressRoutePanel'
import { API_BASE, apiRequest, getEvents, getRoutes, getSummary, getWindows, windowQuery } from '../lib/floodApi'
import type { EventSummary, RouteComparison, EventWindows } from '../lib/floodApi'
import { clearCoverageOverlay, clearEventRaster, FSI_COLORS, loadCoverageOverlay, loadEventRaster, updateEventRoutes } from '../lib/eventLayers'
import type { MapMode, RoutePoint } from '../types/flood'

type MobileTab = 'events' | 'routes' | 'legend' | null

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
  
  // Mobile sheet and HUD state
  const [mobileTab, setMobileTab] = useState<MobileTab>(null)
  const [desktopHudVisible, setDesktopHudVisible] = useState(true)

  useMumbaiMap(containerRef, mapRef, setReady, setError)

  useEffect(() => {
    const controller = new AbortController()
    setEventsLoading(true); setApiError(''); setEvent(''); setSummary(null); setRoutes(null)
    getEvents(controller.signal).then(dates => {
      setEvents(dates); setEvent(dates.at(-1) ?? '')
    }).catch(err => { if (!controller.signal.aborted) { setEvents([]); setApiError(`Cannot load events: ${err.message}. Check that the API server is running.`) } })
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
      setRouteStatus('Calculating flood-aware vs shortest route…')
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
      popup = new Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(e.lngLat).setDOMContent(content).addTo(map)
      const query = new URLSearchParams({ lon: String(e.lngLat.lng), lat: String(e.lngLat.lat) })
      if (selectedMinutes !== undefined) query.set('window_minutes', String(selectedMinutes))
      apiRequest(`/flood/point/${encodeURIComponent(event)}?${query}`, controller.signal)
        .then(response => response.json()).then(data => {
          if (!controller.signal.aborted) {
            const windowLabel = activeWindow ? ` · ${activeWindow.start_time.slice(11,16)}–${activeWindow.end_time.slice(11,16)}` : ' · Daily'
            const fsiLabel = typeof data.fsi === 'number' && Number.isFinite(data.fsi) ? `FSI: ${data.fsi.toFixed(3)} (0–1)` : 'No flood data at this location.'
            const coverageLabel = data.in_station_network === false ? '\n⚠️ Lower confidence (extrapolated)' : data.in_station_network === true ? '\n✓ Station Network Coverage' : ''
            content.textContent = `📍 ${event}${windowLabel}\n${fsiLabel}${coverageLabel}`
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

  const locateUser = () => {
    if (!navigator.geolocation || !mapRef.current) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        mapRef.current?.easeTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 14,
          duration: 900
        })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const disabled = !ready || !intervalReady || eventsLoading
  const buttonClass = 'hud-button flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs'

  return (
    <section className="relative h-full w-full bg-[var(--bg-secondary)] overflow-hidden" aria-label="Mumbai flood susceptibility map">
      {/* Map Canvas */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      {/* Loading / Status Toast Banner */}
      {(!ready || error || rasterStatus || apiError) && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-panel)] px-4 py-2.5 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-xl">
            {error || apiError ? (
              <AlertCircle size={15} className="text-amber-400 shrink-0" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-[var(--cyan-primary)] animate-ping shrink-0" />
            )}
            <span className="font-medium">{error || apiError || rasterStatus || 'Initializing Mumbai Map…'}</span>
          </div>
        </div>
      )}

      {/* Mobile Top Floating Mode Guide */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center md:hidden">
        {mode === 'inspect' && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-panel)]/90 px-3.5 py-1.5 text-[11px] text-[var(--text-secondary)] shadow-lg backdrop-blur-md">
            <Crosshair size={13} className="text-[var(--cyan-primary)]" />
            <span>Tap map anywhere to inspect FSI</span>
          </div>
        )}
        {mode === 'route' && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--bg-panel)]/90 px-3.5 py-1.5 text-[11px] text-[var(--gold-light)] shadow-lg backdrop-blur-md">
            <MapPin size={13} className="text-[var(--cyan-primary)]" />
            <span>{!start ? 'Tap point A (Start)' : !end ? 'Tap point B (Destination)' : 'Route plotted'}</span>
            {start && (
              <button
                type="button"
                className="ml-1 text-xs text-rose-400 hover:underline"
                onClick={() => { setPoints([]); setRoutes(null); setRouteStatus('') }}
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating View Toggles (Mobile Quick Buttons) */}
      <div className="pointer-events-none absolute right-3 top-12 z-20 flex flex-col gap-2 md:hidden">
        <button
          disabled={!ready}
          aria-pressed={satellite}
          aria-label="Toggle Satellite view"
          className="pointer-events-auto hud-button flex h-9 w-9 items-center justify-center rounded-lg shadow-lg"
          onClick={() => setSatellite(v => !v)}
        >
          <Satellite size={16} className={satellite ? 'text-[var(--gold-primary)]' : 'text-[var(--text-secondary)]'} />
        </button>
        <button
          disabled={!ready}
          aria-pressed={threeD}
          aria-label="Toggle 3D Buildings"
          className="pointer-events-auto hud-button flex h-9 w-9 items-center justify-center rounded-lg shadow-lg"
          onClick={() => setThreeD(v => !v)}
        >
          <Box size={16} className={threeD ? 'text-[var(--gold-primary)]' : 'text-[var(--text-secondary)]'} />
        </button>
      </div>

      {/* DESKTOP HUD FLOATING PANELS */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 hidden max-h-[calc(100%_-_8rem)] items-start justify-between gap-4 overflow-y-auto md:flex">
        {/* Left Desktop Panel */}
        <AnimatePresence>
          {desktopHudVisible && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="pointer-events-auto flex w-72 flex-col gap-3"
            >
              <Panel>
                <div className="flex items-center justify-between">
                  <PanelLabel className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-[var(--gold-light)]" />
                    Historical Rainfall
                  </PanelLabel>
                  <button
                    type="button"
                    title="Refresh available events"
                    aria-label="Refresh events"
                    disabled={eventsLoading}
                    className="p-1 text-[var(--text-secondary)] hover:text-[var(--gold-light)] transition disabled:opacity-40"
                    onClick={() => setRefresh(v => v + 1)}
                  >
                    <RefreshCw size={13} className={eventsLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                <select
                  aria-label="Rainfall event selection"
                  className="mt-2.5 w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-xs md:text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold-primary)]"
                  value={event}
                  disabled={eventsLoading || !events.length}
                  onChange={e => { setEvent(e.target.value); setRoutes(null); setSummary(null); setApiError('') }}
                >
                  {!events.length && <option value="">{eventsLoading ? 'Loading events…' : 'No events found'}</option>}
                  {events.map(date => <option key={date} value={date}>{date}</option>)}
                </select>

                {summary && (
                  <div className="mt-3 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)]/60 p-2.5 font-[family-name:var(--font-hud)]">
                    <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
                      <span>MIN: <b className="text-[var(--text-primary)]">{summary.fsi_min.toFixed(2)}</b></span>
                      <span>MEAN: <b className="text-[var(--cyan-primary)]">{summary.fsi_mean.toFixed(2)}</b></span>
                      <span>MAX: <b className="text-amber-400">{summary.fsi_max.toFixed(2)}</b></span>
                    </div>
                  </div>
                )}

                {intervalReady && (
                  <a
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] py-2 text-xs text-[var(--gold-light)] transition hover:border-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/10"
                    href={`${API_BASE}/flood/raster/${encodeURIComponent(event)}${windowQuery(selectedMinutes)}`}
                    download
                  >
                    <Download size={13} />
                    Download GeoTIFF Raster
                  </a>
                )}
              </Panel>

              {/* FSI Scale Legend */}
              <Panel>
                <PanelLabel className="flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[var(--cyan-primary)]" />
                  Flood Susceptibility Index
                </PanelLabel>
                <div className="mt-2.5 space-y-1.5">
                  {[
                    { label: 'Low Risk', range: '0.00 – 0.25', color: FSI_COLORS[0] },
                    { label: 'Medium Risk', range: '0.25 – 0.50', color: FSI_COLORS[1] },
                    { label: 'High Risk', range: '0.50 – 0.75', color: FSI_COLORS[2] },
                    { label: 'Severe Risk', range: '0.75 – 1.00', color: FSI_COLORS[3] },
                  ].map(item => (
                    <div className="flex items-center justify-between text-xs" key={item.label}>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded shadow-sm" style={{ background: item.color }} />
                        <span className="text-[var(--text-primary)]">{item.label}</span>
                      </div>
                      <span className="font-[family-name:var(--font-hud)] text-[10px] text-[var(--text-secondary)]">{item.range}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--border-secondary)] pt-2 text-[11px] text-[var(--text-secondary)]">
                  <span
                    className="h-3 w-3 rounded border border-slate-400 shrink-0"
                    style={{ background: 'repeating-linear-gradient(135deg, rgb(226 232 240 / 0.7) 0 2px, rgb(15 23 42 / 0.45) 2px 6px)' }}
                  />
                  <span>Hatched: Extrapolated (outside gauge network)</span>
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Desktop Panel */}
        <AnimatePresence>
          {desktopHudVisible && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="pointer-events-auto flex w-80 flex-col gap-3"
            >
              {/* Map Layer Controls */}
              <div className="flex gap-2">
                <button
                  disabled={!ready}
                  aria-pressed={satellite}
                  aria-label="Satellite imagery"
                  className={buttonClass}
                  onClick={() => setSatellite(v => !v)}
                >
                  <Satellite size={14} />
                  Satellite
                </button>
                <button
                  disabled={!ready}
                  aria-pressed={threeD}
                  aria-label="3D buildings"
                  className={buttonClass}
                  onClick={() => setThreeD(v => !v)}
                >
                  <Box size={14} />
                  3D Buildings
                </button>
              </div>

              {/* Mode & Routing Panel */}
              <Panel>
                <PanelLabel className="flex items-center gap-1.5">
                  <Navigation2 size={13} className="text-[var(--cyan-primary)]" />
                  Navigation & Analysis
                </PanelLabel>

                <div className="my-2.5 flex gap-1 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-0.5">
                  <button
                    disabled={disabled}
                    aria-pressed={mode === 'inspect'}
                    className={`flex-1 rounded-md py-1.5 text-center text-xs transition ${mode === 'inspect' ? 'bg-[var(--gold-primary)] font-semibold text-[var(--bg-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    onClick={() => setMode('inspect')}
                  >
                    Inspect
                  </button>
                  <button
                    disabled={disabled}
                    aria-pressed={mode === 'route'}
                    className={`flex-1 rounded-md py-1.5 text-center text-xs transition ${mode === 'route' ? 'bg-[var(--gold-primary)] font-semibold text-[var(--bg-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    onClick={() => setMode('route')}
                  >
                    Map Pin
                  </button>
                  <button
                    disabled={disabled}
                    aria-pressed={mode === 'route-address'}
                    className={`flex-1 rounded-md py-1.5 text-center text-xs transition ${mode === 'route-address' ? 'bg-[var(--gold-primary)] font-semibold text-[var(--bg-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    onClick={() => setMode('route-address')}
                  >
                    Address
                  </button>
                </div>

                <PanelCaption>
                  {mode === 'inspect'
                    ? 'Click any point on the map for local flood index (FSI).'
                    : mode === 'route'
                    ? (!start ? '1. Click map for start point.' : !end ? '2. Click map for destination.' : 'Points connected via road network.')
                    : 'Search Mumbai locations to compute flood-aware route.'}
                </PanelCaption>

                {mode === 'route-address' && (
                  <AddressRoutePanel
                    onRouteFound={(s, e) => { setPoints([s, e]); setRoutes(null); setRouteStatus('') }}
                    onClear={() => { setPoints([]); setRoutes(null); setRouteStatus('') }}
                    disabled={disabled}
                    routeStatus={routeStatus}
                    hasRoute={!!routes}
                  />
                )}

                {mode === 'route' && points.map((p, i) => (
                  <div key={i} className="mt-2 flex items-center justify-between rounded border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-2.5 py-1.5 font-[family-name:var(--font-hud)] text-xs">
                    <span className="font-bold text-[var(--gold-light)]">{i === 0 ? 'A (Start)' : 'B (Dest)'}</span>
                    <span className="text-[var(--text-secondary)]">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
                  </div>
                ))}

                {mode === 'route' && start && (
                  <button
                    type="button"
                    className="hud-button mt-2.5 h-8 w-full text-xs text-rose-300"
                    onClick={() => { setPoints([]); setRoutes(null); setRouteStatus('') }}
                  >
                    Clear Points
                  </button>
                )}

                {/* Route Comparison Output */}
                {routes && (
                  <div className="mt-3 space-y-2 rounded-xl border border-[var(--cyan-primary)]/30 bg-[var(--bg-primary)]/80 p-3 text-xs shadow-lg" aria-live="polite">
                    <div className="flex items-center justify-between border-b border-[var(--border-secondary)] pb-1.5">
                      <span className="font-semibold text-[var(--cyan-primary)] flex items-center gap-1">
                        <ShieldCheck size={14} />
                        Flood-Aware Safe Route
                      </span>
                      <span className="font-[family-name:var(--font-hud)] font-bold text-[var(--text-primary)]">
                        {(routes.flood_aware_route.length_m / 1000).toFixed(2)} km
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <span>Shortest Standard Route</span>
                      <span className="font-[family-name:var(--font-hud)]">
                        {(routes.normal_route.length_m / 1000).toFixed(2)} km
                      </span>
                    </div>

                    <div className="rounded bg-[var(--bg-secondary)] p-2 font-[family-name:var(--font-hud)] text-[11px] text-[var(--text-secondary)] space-y-1">
                      <div className="flex justify-between">
                        <span>Safe Avg Risk:</span>
                        <span className="text-emerald-400 font-bold">{routes.flood_aware_route.avg_risk.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Shortest Avg Risk:</span>
                        <span className="text-amber-400 font-bold">{routes.normal_route.avg_risk.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between border-t border-[var(--border-secondary)] pt-1 text-[10px]">
                        <span>Detour Distance:</span>
                        <span className="text-[var(--gold-light)]">+{(routes.extra_distance_m / 1000).toFixed(2)} km ({routes.extra_distance_pct.toFixed(1)}%)</span>
                      </div>
                    </div>
                  </div>
                )}
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop HUD Panel Toggle */}
      <button
        type="button"
        title={desktopHudVisible ? 'Minimize HUD Panels' : 'Show HUD Panels'}
        aria-label="Toggle HUD panels"
        className="pointer-events-auto absolute left-4 top-4 z-20 hidden md:flex hud-button h-8 w-8 items-center justify-center rounded-lg shadow-lg"
        onClick={() => setDesktopHudVisible(v => !v)}
      >
        {desktopHudVisible ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>

      {/* DESKTOP TIMELINE DOCK (Bottom center) */}
      <section aria-label="FSI time interval" className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden w-[min(92%,36rem)] -translate-x-1/2 md:block">
        <div className="pointer-events-auto hud-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <PanelLabel className="flex items-center gap-1.5">
              <Clock size={12} className="text-[var(--cyan-primary)]" />
              {activeWindow ? `Observed Accumulation Window (${minutes} min)` : 'Rainfall Accumulation Window'}
            </PanelLabel>
            {activeWindow && (
              <span className="font-[family-name:var(--font-hud)] text-[11px] text-[var(--gold-light)]">
                {activeWindow.start_time.slice(11, 16)} → {activeWindow.end_time.slice(11, 16)}
              </span>
            )}
          </div>

          <div role="group" aria-label="Rainfall duration intervals" className="grid grid-cols-6 gap-1.5">
            {[15, 30, 60, 90, 120, 180].map(val => (
              <button
                key={val}
                className="hud-button h-8 px-1 text-xs font-semibold"
                disabled={disabled || !windows?.windows.some(w => w.minutes === val)}
                aria-pressed={!!activeWindow && val === minutes}
                onClick={() => { setMinutes(val); setRoutes(null); setSummary(null); setRouteStatus('') }}
              >
                {val}m
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* MOBILE BOTTOM NAVIGATION DOCK (4 Tabs) */}
      <nav aria-label="Mobile Navigation" className="absolute bottom-0 inset-x-0 z-30 flex md:hidden items-center justify-around border-t border-[var(--border-primary)] bg-[var(--bg-sheet)] px-2 py-2 backdrop-blur-xl pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-pressed={mobileTab === 'events'}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition ${mobileTab === 'events' ? 'text-[var(--gold-light)] bg-[var(--gold-primary)]/15 font-bold' : 'text-[var(--text-secondary)]'}`}
          onClick={() => setMobileTab(current => current === 'events' ? null : 'events')}
        >
          <Calendar size={18} />
          <span>Events</span>
        </button>

        <button
          type="button"
          aria-pressed={mobileTab === 'routes'}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition ${mobileTab === 'routes' ? 'text-[var(--cyan-primary)] bg-[var(--cyan-primary)]/15 font-bold' : 'text-[var(--text-secondary)]'}`}
          onClick={() => {
            setMobileTab(current => current === 'routes' ? null : 'routes')
            if (mode === 'inspect') setMode('route-address')
          }}
        >
          <Route size={18} />
          <span>Routes</span>
        </button>

        <button
          type="button"
          aria-pressed={mobileTab === 'legend'}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition ${mobileTab === 'legend' ? 'text-[var(--gold-light)] bg-[var(--gold-primary)]/15 font-bold' : 'text-[var(--text-secondary)]'}`}
          onClick={() => setMobileTab(current => current === 'legend' ? null : 'legend')}
        >
          <Layers size={18} />
          <span>Legend</span>
        </button>

        <button
          type="button"
          aria-pressed={mode === 'inspect' && mobileTab === null}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition ${mode === 'inspect' && mobileTab === null ? 'text-emerald-400 bg-emerald-500/15 font-bold' : 'text-[var(--text-secondary)]'}`}
          onClick={() => {
            setMode('inspect')
            setMobileTab(null)
          }}
        >
          <Crosshair size={18} />
          <span>Inspect</span>
        </button>
      </nav>

      {/* MOBILE ANIMATED BOTTOM SHEET */}
      <AnimatePresence>
        {mobileTab !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setMobileTab(null)}
            />

            {/* Sheet Container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="absolute bottom-[56px] inset-x-0 z-40 max-h-[75vh] overflow-hidden rounded-t-2xl border-t border-[var(--border-primary)] bg-[var(--bg-sheet)] p-4 shadow-2xl backdrop-blur-2xl md:hidden flex flex-col"
            >
              {/* Drag handle / Header */}
              <div className="flex items-center justify-between border-b border-[var(--border-secondary)] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-8 rounded-full bg-slate-600 mr-2" />
                  <h3 className="font-[family-name:var(--font-hud)] text-xs font-bold uppercase tracking-wider text-[var(--text-heading)]">
                    {mobileTab === 'events' && '📅 Rainfall Events & Time Intervals'}
                    {mobileTab === 'routes' && '🧭 Safe Flood-Aware Routing'}
                    {mobileTab === 'legend' && '📊 Layers & Susceptibility Scale'}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Close sheet"
                  className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white"
                  onClick={() => setMobileTab(null)}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Sheet Body Content */}
              <div className="overflow-y-auto pt-3 pb-6 flex-1 space-y-4">
                {/* EVENTS TAB CONTENT */}
                {mobileTab === 'events' && (
                  <div className="space-y-3">
                    <div>
                      <PanelLabel className="mb-1.5">Historical Date Selection</PanelLabel>
                      <div className="flex gap-2">
                        <select
                          aria-label="Rainfall event selection"
                          className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)]"
                          value={event}
                          disabled={eventsLoading || !events.length}
                          onChange={e => { setEvent(e.target.value); setRoutes(null); setSummary(null); setApiError('') }}
                        >
                          {!events.length && <option value="">{eventsLoading ? 'Loading events…' : 'No events found'}</option>}
                          {events.map(date => <option key={date} value={date}>{date}</option>)}
                        </select>
                        <button
                          type="button"
                          aria-label="Refresh events"
                          disabled={eventsLoading}
                          className="hud-button flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                          onClick={() => setRefresh(v => v + 1)}
                        >
                          <RefreshCw size={15} className={eventsLoading ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </div>

                    {/* Time Intervals */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <PanelLabel>Accumulation Window</PanelLabel>
                        {activeWindow && (
                          <span className="font-[family-name:var(--font-hud)] text-[11px] text-[var(--gold-light)]">
                            {activeWindow.start_time.slice(11, 16)} → {activeWindow.end_time.slice(11, 16)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[15, 30, 60, 90, 120, 180].map(val => (
                          <button
                            key={val}
                            className="hud-button h-10 px-2 text-xs font-semibold"
                            disabled={disabled || !windows?.windows.some(w => w.minutes === val)}
                            aria-pressed={!!activeWindow && val === minutes}
                            onClick={() => { setMinutes(val); setRoutes(null); setSummary(null); setRouteStatus('') }}
                          >
                            {val} minutes
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* FSI Stats */}
                    {summary && (
                      <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-3 font-[family-name:var(--font-hud)]">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Event Summary Index</div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded bg-[var(--bg-secondary)] p-2">
                            <span className="text-[10px] text-[var(--text-secondary)] block">MIN</span>
                            <b className="text-[var(--text-primary)]">{summary.fsi_min.toFixed(2)}</b>
                          </div>
                          <div className="rounded bg-[var(--bg-secondary)] p-2">
                            <span className="text-[10px] text-[var(--text-secondary)] block">MEAN</span>
                            <b className="text-[var(--cyan-primary)]">{summary.fsi_mean.toFixed(2)}</b>
                          </div>
                          <div className="rounded bg-[var(--bg-secondary)] p-2">
                            <span className="text-[10px] text-[var(--text-secondary)] block">MAX</span>
                            <b className="text-amber-400">{summary.fsi_max.toFixed(2)}</b>
                          </div>
                        </div>
                      </div>
                    )}

                    {intervalReady && (
                      <a
                        className="flex items-center justify-center gap-2 rounded-xl border border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 py-3 text-xs font-semibold text-[var(--gold-light)]"
                        href={`${API_BASE}/flood/raster/${encodeURIComponent(event)}${windowQuery(selectedMinutes)}`}
                        download
                      >
                        <Download size={14} />
                        Download FSI GeoTIFF
                      </a>
                    )}
                  </div>
                )}

                {/* ROUTES TAB CONTENT */}
                {mobileTab === 'routes' && (
                  <div className="space-y-3">
                    <div className="flex gap-1 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-0.5">
                      <button
                        type="button"
                        className={`flex-1 rounded-md py-2 text-center text-xs font-medium transition ${mode === 'route-address' ? 'bg-[var(--gold-primary)] font-semibold text-[var(--bg-primary)]' : 'text-[var(--text-secondary)]'}`}
                        onClick={() => setMode('route-address')}
                      >
                        Address Search
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded-md py-2 text-center text-xs font-medium transition ${mode === 'route' ? 'bg-[var(--gold-primary)] font-semibold text-[var(--bg-primary)]' : 'text-[var(--text-secondary)]'}`}
                        onClick={() => {
                          setMode('route')
                          setMobileTab(null) // Dismiss sheet to let user tap points on map
                        }}
                      >
                        Pick Points on Map
                      </button>
                    </div>

                    <AddressRoutePanel
                      onRouteFound={(s, e) => { setPoints([s, e]); setRoutes(null); setRouteStatus('') }}
                      onClear={() => { setPoints([]); setRoutes(null); setRouteStatus('') }}
                      disabled={disabled}
                      routeStatus={routeStatus}
                      hasRoute={!!routes}
                    />

                    {/* Route Results Card on Mobile */}
                    {routes && (
                      <div className="rounded-xl border border-[var(--cyan-primary)]/40 bg-[var(--bg-primary)] p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between border-b border-[var(--border-secondary)] pb-2">
                          <span className="font-semibold text-[var(--cyan-primary)] flex items-center gap-1.5">
                            <ShieldCheck size={16} />
                            Safe Flood-Aware Route
                          </span>
                          <span className="font-[family-name:var(--font-hud)] text-sm font-bold text-white">
                            {(routes.flood_aware_route.length_m / 1000).toFixed(2)} km
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[var(--text-secondary)]">
                          <span>Shortest Route</span>
                          <span className="font-[family-name:var(--font-hud)]">
                            {(routes.normal_route.length_m / 1000).toFixed(2)} km
                          </span>
                        </div>

                        <div className="rounded-lg bg-[var(--bg-secondary)] p-2.5 font-[family-name:var(--font-hud)] text-[11px] text-[var(--text-secondary)] space-y-1">
                          <div className="flex justify-between">
                            <span>Flood-Aware Risk Score:</span>
                            <span className="text-emerald-400 font-bold">{routes.flood_aware_route.avg_risk.toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Shortest Route Risk:</span>
                            <span className="text-amber-400 font-bold">{routes.normal_route.avg_risk.toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between border-t border-[var(--border-secondary)] pt-1 text-[10px]">
                            <span>Safer Detour:</span>
                            <span className="text-[var(--gold-light)]">+{(routes.extra_distance_m / 1000).toFixed(2)} km ({routes.extra_distance_pct.toFixed(1)}%)</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="hud-button mt-2 h-9 w-full text-xs font-semibold text-[var(--cyan-primary)]"
                          onClick={() => setMobileTab(null)}
                        >
                          View Route on Map
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* LEGEND TAB CONTENT */}
                {mobileTab === 'legend' && (
                  <div className="space-y-3.5">
                    {/* View Layer Toggles */}
                    <div className="flex gap-2">
                      <button
                        disabled={!ready}
                        aria-pressed={satellite}
                        className="hud-button flex h-10 flex-1 items-center justify-center gap-2 text-xs"
                        onClick={() => setSatellite(v => !v)}
                      >
                        <Satellite size={15} />
                        Satellite Imagery
                      </button>
                      <button
                        disabled={!ready}
                        aria-pressed={threeD}
                        className="hud-button flex h-10 flex-1 items-center justify-center gap-2 text-xs"
                        onClick={() => setThreeD(v => !v)}
                      >
                        <Box size={15} />
                        3D Extrusions
                      </button>
                    </div>

                    {/* Scale */}
                    <div className="space-y-2">
                      <PanelLabel>Flood Susceptibility Index (0.0 – 1.0)</PanelLabel>
                      {[
                        { label: 'Low Susceptibility', range: '0.00 – 0.25', color: FSI_COLORS[0] },
                        { label: 'Medium Susceptibility', range: '0.25 – 0.50', color: FSI_COLORS[1] },
                        { label: 'High Susceptibility', range: '0.50 – 0.75', color: FSI_COLORS[2] },
                        { label: 'Severe Susceptibility', range: '0.75 – 1.00', color: FSI_COLORS[3] },
                      ].map(item => (
                        <div className="flex items-center justify-between rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-2 text-xs" key={item.label}>
                          <div className="flex items-center gap-2.5">
                            <span className="h-3.5 w-3.5 rounded shadow" style={{ background: item.color }} />
                            <span className="font-medium text-[var(--text-primary)]">{item.label}</span>
                          </div>
                          <span className="font-[family-name:var(--font-hud)] text-[11px] text-[var(--text-secondary)]">{item.range}</span>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)] space-y-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded border border-slate-400 shrink-0"
                          style={{ background: 'repeating-linear-gradient(135deg, rgb(226 232 240 / 0.7) 0 2px, rgb(15 23 42 / 0.45) 2px 6px)' }}
                        />
                        <span className="font-semibold text-[var(--text-primary)]">Hatched Confidence Overlay</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Areas with cross-hatching sit outside BMC rain-gauge triangulation and represent extrapolated predictions.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Map Pan & Zoom Controls */}
      <MapControls mapRef={mapRef} onLocateUser={locateUser} />
    </section>
  )
}
