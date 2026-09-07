import { useState, useEffect } from 'react'
import { PanelCaption } from './ui/Panel'
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
    }, 500)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startQuery.trim() || !endQuery.trim()) {
      setError('Please enter both start and destination addresses.')
      return
    }
    setError('')
    setLoading(true)
    
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      
      const [startRes, endRes] = await Promise.all([
        geocodeAddress(startQuery, controller.signal),
        geocodeAddress(endQuery, controller.signal)
      ])
      
      clearTimeout(timeout)
      
      if (!startRes) {
        setError(`Could not find location: "${startQuery}". Please enter a more specific Mumbai address.`)
        return
      }
      if (!endRes) {
        setError(`Could not find location: "${endQuery}". Please enter a more specific Mumbai address.`)
        return
      }
      
      setStartQuery(startRes.displayName)
      setEndQuery(endRes.displayName)
      
      onRouteFound(
        { lat: startRes.lat, lng: startRes.lng },
        { lat: endRes.lat, lng: endRes.lng }
      )
    } catch (err: any) {
      setError(err.name === 'AbortError' ? 'Geocoding request timed out.' : err.message || 'Failed to geocode addresses.')
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
        setError('Unable to retrieve your location.')
        setLoading(false)
      }
    )
  }

  const handleClear = () => {
    setStartQuery('')
    setEndQuery('')
    setError('')
    onClear()
  }
  
  const renderSuggestions = (
    suggestions: GeocodeResult[], 
    focused: boolean, 
    onSelect: (s: GeocodeResult) => void
  ) => {
    if (!focused || suggestions.length === 0) return null
    return (
      <div className="absolute z-50 mt-1 w-full rounded border border-[var(--border-secondary)] bg-[var(--bg-panel)] shadow-lg overflow-hidden max-h-48 overflow-y-auto">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] border-b border-[var(--border-secondary)] last:border-b-0 truncate"
            onMouseDown={() => onSelect(s)} // Use onMouseDown to fire before input onBlur
          >
            {s.displayName}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="relative">
          <input
            type="text"
            className="w-full rounded border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]"
            placeholder="Start location / address"
            value={startQuery}
            onChange={(e) => setStartQuery(e.target.value)}
            onFocus={() => setStartFocused(true)}
            onBlur={() => setStartFocused(false)}
            disabled={disabled || loading}
          />
          {renderSuggestions(startSuggestions, startFocused, (s) => {
            setStartQuery(s.displayName)
            setStartFocused(false)
          })}
          <button
            type="button"
            className="mt-1 text-xs text-[var(--cyan-primary)] hover:underline disabled:opacity-50"
            onClick={handleUseLocation}
            disabled={disabled || loading}
          >
            Use my location
          </button>
        </div>
        
        <div className="relative">
          <input
            type="text"
            className="w-full rounded border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]"
            placeholder="Destination / address"
            value={endQuery}
            onChange={(e) => setEndQuery(e.target.value)}
            onFocus={() => setEndFocused(true)}
            onBlur={() => setEndFocused(false)}
            disabled={disabled || loading}
          />
          {renderSuggestions(endSuggestions, endFocused, (s) => {
            setEndQuery(s.displayName)
            setEndFocused(false)
          })}
        </div>
        
        <button
          type="submit"
          className="hud-button mt-1 px-3 py-2 text-xs font-semibold w-full"
          disabled={disabled || loading || !startQuery.trim() || !endQuery.trim()}
        >
          {loading ? 'Finding...' : 'Find Route'}
        </button>
      </form>
      
      <div role="status">
        {error && <PanelCaption className="mt-2 text-red-400">{error}</PanelCaption>}
        {routeStatus && <PanelCaption className="mt-2">{routeStatus}</PanelCaption>}
      </div>

      {hasRoute && (
        <button className="hud-button mt-3 px-3 py-2 text-xs w-full text-red-400 border-red-900/30" onClick={handleClear}>
          Clear route
        </button>
      )}
    </div>
  )
}
