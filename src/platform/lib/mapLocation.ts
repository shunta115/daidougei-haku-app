import type { Performer } from './types'

export type MapCoordinates = { lat: number; lng: number; accuracy?: number }

export const MAP_LOCATION_STALE_MS = 90_000

export function isFreshLiveLocation(
  performer: Performer,
  now = Date.now(),
  staleAfterMs = MAP_LOCATION_STALE_MS,
) {
  if (!performer.is_live || !performer.share_location) return false
  if (!Number.isFinite(performer.lat) || !Number.isFinite(performer.lng)) return false
  if (!performer.location_updated_at) return false
  const updatedAt = new Date(performer.location_updated_at).getTime()
  return Number.isFinite(updatedAt) && now - updatedAt <= staleAfterMs
}

export function distanceKm(from: MapCoordinates, to: MapCoordinates) {
  const rad = (value: number) => value * Math.PI / 180
  const dLat = rad(to.lat - from.lat)
  const dLng = rad(to.lng - from.lng)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatMapDistance(km: number) {
  if (km < 1) return `${Math.max(10, Math.round(km * 1000 / 10) * 10)}m`
  return `${km.toFixed(km < 10 ? 1 : 0)}km`
}

export function walkingMinutes(km: number) {
  return Math.max(1, Math.round(km * 1000 / 80))
}
