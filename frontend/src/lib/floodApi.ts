import type { RoutePoint } from '../types/flood'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export interface EventSummary { event_date: string; fsi_min: number; fsi_max: number; fsi_mean: number }
export interface EventWindow { minutes: number; start_time: string; end_time: string }
export interface EventWindows { event_date: string; time_basis?: string; windows: EventWindow[] }
export function windowQuery(minutes?: number) { return minutes === undefined ? '' : `?window_minutes=${minutes}` }
export async function getWindows(event: string, signal: AbortSignal): Promise<EventWindows> {
  return (await apiRequest(`/flood/windows/${encodeURIComponent(event)}`, signal)).json()
}
export interface ApiRoute { length_m: number; max_risk: number; avg_risk: number; coordinates: [number, number][] }
export interface RouteComparison {
  event_date: string
  normal_route: ApiRoute
  flood_aware_route: ApiRoute
  extra_distance_m: number
  extra_distance_pct: number
}
export async function apiRequest(path: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(`${API_BASE}${path}`, {
    signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(typeof error?.detail === 'string' ? error.detail : `API request failed (${response.status}).`)
  }
  return response
}
export async function getEvents(signal: AbortSignal): Promise<string[]> {
  const events = await (await apiRequest('/flood/events', signal)).json()
  if (!Array.isArray(events) || !events.every(event => typeof event === 'string')) throw new Error('Unexpected event response. Check the API address.')
  return events
}
export async function getSummary(event: string, signal: AbortSignal, minutes?: number): Promise<EventSummary> {
  return (await apiRequest(`/flood/summary/${encodeURIComponent(event)}${windowQuery(minutes)}`, signal)).json()
}
export async function getRoutes(event: string, start: RoutePoint, end: RoutePoint, signal: AbortSignal, minutes?: number): Promise<RouteComparison> {
  return (await apiRequest('/route', signal, {
    event_date: event, origin_lat: start.lat, origin_lon: start.lng, dest_lat: end.lat, dest_lon: end.lng, window_minutes: minutes,
  })).json()
}
