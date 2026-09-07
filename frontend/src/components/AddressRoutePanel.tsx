import { useState } from 'react'
import Panel, { PanelCaption, PanelLabel } from './ui/Panel'
import { geocodeAddress } from '../lib/floodApi'
import type { RoutePoint } from '../types/flood'

interface Props {
  onRouteFound: (start: RoutePoint, end: RoutePoint) => void
  onClear: () => void
  disabled?: boolean
  routeStatus?: string
  hasRoute?: boolean
}

export default function AddressRoutePanel({ onRouteFound, onClear, disabled, routeStatus, hasRoute }: Props) {
  const [startQuery, setStartQuery] = useState('')
  const [endQuery, setEndQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <div className="mt-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div>
          <input
            type="text"
            className="w-full rounded border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]"
            placeholder="Start location / address"
            value={startQuery}
            onChange={(e) => setStartQuery(e.target.value)}
            disabled={disabled || loading}
          />
          <button
            type="button"
            className="mt-1 text-xs text-[var(--cyan-primary)] hover:underline disabled:opacity-50"
            onClick={handleUseLocation}
            disabled={disabled || loading}
          >
            Use my location
          </button>
        </div>
        
        <input
          type="text"
          className="w-full rounded border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]"
          placeholder="Destination / address"
          value={endQuery}
          onChange={(e) => setEndQuery(e.target.value)}
          disabled={disabled || loading}
        />
        
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
