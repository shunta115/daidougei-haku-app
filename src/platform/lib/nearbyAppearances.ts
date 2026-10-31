import { distanceKm, type MapCoordinates } from './mapLocation'
import type { Performer, PerformerAppearance } from './types'
import { resolveAppearanceLocation } from './appearanceLocation'

export type AppearanceMarker = { appearance: PerformerAppearance; performer: Performer; overlapsLive: boolean }

export function rankNearbyAppearances(rows: AppearanceMarker[], location: MapCoordinates | null, areaQuery: string) {
  const query = areaQuery.trim().toLocaleLowerCase()
  return rows
    .flatMap((item) => {
      const locationPoint = resolveAppearanceLocation(item.appearance)
      if (!locationPoint) return []
      return [{
      ...item,
      distance: location ? distanceKm(location, locationPoint) : null,
    }]
    })
    .filter(({ appearance }) => !query || [appearance.venue_name, appearance.venue_address, appearance.region, appearance.country, resolveAppearanceLocation(appearance)?.label || ''].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY) || Date.parse(a.appearance.starts_at) - Date.parse(b.appearance.starts_at))
}
