import { distanceKm, type MapCoordinates } from './mapLocation'
import type { Performer, PerformerAppearance } from './types'

export type AppearanceMarker = { appearance: PerformerAppearance; performer: Performer; overlapsLive: boolean }

export function rankNearbyAppearances(rows: AppearanceMarker[], location: MapCoordinates | null, areaQuery: string) {
  const query = areaQuery.trim().toLocaleLowerCase()
  return rows
    .map((item) => ({
      ...item,
      distance: location ? distanceKm(location, { lat: item.appearance.venue_lat!, lng: item.appearance.venue_lng! }) : null,
    }))
    .filter(({ appearance }) => !query || [appearance.venue_name, appearance.venue_address, appearance.region, appearance.country].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY) || Date.parse(a.appearance.starts_at) - Date.parse(b.appearance.starts_at))
}
