import { useState, useEffect } from 'react'
import { ArrowUpDown, Loader2, MapPin, Navigation, Sparkles, X } from 'lucide-react'
import { geocodeAddress, geocodeSuggest } from '../lib/floodApi'
import type { GeocodeResult } from '../lib/floodApi'
import type { RoutePoint } from '../types/flood'

interface Props {
  onRouteFound: (start: RoutePoint, end: RoutePoint) => void
  onClear: () => void
  disabled?: boolean
  routeStatus?: string
  hasRoute?: boolean
}

const MUMBAI_PRESETS = [
  { name: 'BKC', query: 'Bandra Kurla Complex, Mumbai' },
  { name: 'Dadar', query: 'Dadar Station, Mumbai' },
  { name: 'Andheri', query: 'Andheri East, Mumbai' },
  { name: 'Airport (BOM)', query: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai' },
  { name: 'Kurla', query: 'Kurla West, Mumbai' },
  { name: 'Colaba', query: 'Colaba, Mumbai' },
]

function useSuggestions(query: string, setSuggestions: (s: GeocodeResult[]) => void) {
  useEffect(() => {
    if (!query.trim() || query.match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/)) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      geocodeSuggest(query, controller.signal)
        .then(res => {
          if (!controller.signal.aborted) setSuggestions(res)
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestions([])
        })
    }, 450)
    return () => { clearTimeout(timeoutId); controller.abort() }
  }, [query, setSuggestions])
}

export default function AddressRoutePanel({ onRouteFound, onClear, disabled, routeStatus, hasRoute }: Props) {
  const [startQuery, setStartQuery] = useState('')
  const [endQuery, setEndQuery] = useState('')
  const [startSuggestions, setStartSuggestions] = useState<GeocodeResult[]>([])
  const [endSuggestions, setEndSuggestions] = useState<GeocodeResult[]>([])
  
  const [startFocused, setStartFocused] = useState(false)
  const [endFocused, setEndFocused] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useSuggestions(startQuery, setStartSuggestions)
  useSuggestions(endQuery, setEndSuggestions)

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!startQuery.trim() || !endQuery.trim()) {
      setError('Please enter both start and destination locations.')
      return
    }
    setError('')
    setLoading(true)
    
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)
      
      const [startRes, endRes] = await Promise.all([
        geocodeAddress(startQuery, controller.signal),
        geocodeAddress(endQuery, controller.signal)
      ])
      
      clearTimeout(timeout)
      
      if (!startRes) {
        setError(`Location not found: "${startQuery}". Try adding "Mumbai" or using a landmark.`)
        return
      }
      if (!endRes) {
        setError(`Location not found: "${endQuery}". Try adding "Mumbai" or using a landmark.`)
        return
      }
      
      setStartQuery(startRes.displayName.split(',')[0] || startRes.displayName)
      setEndQuery(endRes.displayName.split(',')[0] || endRes.displayName)
      
      onRouteFound(
        { lat: startRes.lat, lng: startRes.lng },
        { lat: endRes.lat, lng: endRes.lng }
      )
    } catch (err: any) {
      setError(err.name === 'AbortError' ? 'Geocoding timed out. Check network connection.' : err.message || 'Failed to locate addresses.')
    } finally {
      setLoading(false)
    }
  }

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }
    setLoading(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStartQuery(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
        setLoading(false)
      },
      () => {
        setError('Could not retrieve device GPS location. Please type an address.')
        setLoading(false)
      },
      { timeout: 8000, enableHighAccuracy: true }
    )
  }

  const handleSwap = () => {
    const temp = startQuery
    setStartQuery(endQuery)
    setEndQuery(temp)
  }

  const handleClear = () => {
    setStartQuery('')
    setEndQuery('')
    setError('')
    onClear()
  }

  const applyPreset = (presetQuery: string) => {
    if (!startQuery.trim()) {
      setStartQuery(presetQuery)
    } else {
      setEndQuery(presetQuery)
    }
  }
  
  const renderSuggestions = (
    suggestions: GeocodeResult[], 
    focused: boolean, 
    onSelect: (s: GeocodeResult) => void
  ) => {
    if (!focused || suggestions.length === 0) return null
    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--border-primary)] bg-[var(--bg-panel)] shadow-2xl backdrop-blur-xl">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            className="flex w-full items-start gap-2.5 border-b border-[var(--border-secondary)] px-3 py-2.5 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)] last:border-b-0 active:bg-[var(--border-active)]"
            onMouseDown={() => onSelect(s)}
          >
            <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--cyan-primary)]" />
            <span className="line-clamp-2 leading-relaxed">{s.displayName}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {/* Start point */}
        <div className="relative">
          <div className="flex items-center rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-2.5 focus-within:border-[var(--gold-primary)]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">A</span>
            <input
              type="text"
              className="w-full bg-transparent px-2.5 py-2 text-xs md:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
              placeholder="Origin / Start location"
              value={startQuery}
              onChange={(e) => setStartQuery(e.target.value)}
              onFocus={() => setStartFocused(true)}
              onBlur={() => setTimeout(() => setStartFocused(false), 200)}
              disabled={disabled || loading}
            />
            {startQuery && (
              <button
                type="button"
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                onClick={() => setStartQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {renderSuggestions(startSuggestions, startFocused, (s) => {
            setStartQuery(s.displayName.split(',')[0] || s.displayName)
            setStartFocused(false)
          })}
        </div>

        {/* Action row between inputs */}
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--cyan-primary)] hover:underline active:opacity-75 disabled:opacity-50"
            onClick={handleUseLocation}
            disabled={disabled || loading}
          >
            <Navigation size={12} />
            Use current GPS
          </button>

          <button
            type="button"
            title="Swap Origin and Destination"
            className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--gold-light)] active:scale-95"
            onClick={handleSwap}
            disabled={disabled || loading}
          >
            <ArrowUpDown size={12} />
          </button>
        </div>

        {/* Destination point */}
        <div className="relative">
          <div className="flex items-center rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-2.5 focus-within:border-[var(--gold-primary)]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-400">B</span>
            <input
              type="text"
              className="w-full bg-transparent px-2.5 py-2 text-xs md:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
              placeholder="Destination in Mumbai"
              value={endQuery}
              onChange={(e) => setEndQuery(e.target.value)}
              onFocus={() => setEndFocused(true)}
              onBlur={() => setTimeout(() => setEndFocused(false), 200)}
              disabled={disabled || loading}
            />
            {endQuery && (
              <button
                type="button"
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                onClick={() => setEndQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {renderSuggestions(endSuggestions, endFocused, (s) => {
            setEndQuery(s.displayName.split(',')[0] || s.displayName)
            setEndFocused(false)
          })}
        </div>

        {/* Quick presets */}
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            <Sparkles size={10} className="text-[var(--gold-light)]" />
            Quick Destinations
          </div>
          <div className="flex flex-wrap gap-1">
            {MUMBAI_PRESETS.map(preset => (
              <button
                key={preset.name}
                type="button"
                className="rounded border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--gold-primary)] hover:text-[var(--text-primary)] active:scale-95"
                onClick={() => applyPreset(preset.query)}
                disabled={disabled || loading}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          className="hud-button flex h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold uppercase tracking-wider shadow-lg"
          disabled={disabled || loading || !startQuery.trim() || !endQuery.trim()}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Calculating Safest Route…
            </>
          ) : (
            'Compute Safe Route'
          )}
        </button>
      </form>
      
      {/* Messages */}
      <div role="status">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {routeStatus && (
          <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2 text-xs text-cyan-300">
            <Loader2 size={13} className="animate-spin shrink-0" />
            <span>{routeStatus}</span>
          </div>
        )}
      </div>

      {hasRoute && (
        <button
          type="button"
          className="hud-button flex h-9 w-full items-center justify-center gap-1.5 border-rose-500/30 text-rose-300 hover:border-rose-500 hover:text-rose-200"
          onClick={handleClear}
        >
          <X size={14} />
          Clear Route
        </button>
      )}
    </div>
  )
}

