import { resolveAppearanceLocation } from './appearanceLocation'
import { isFreshLiveLocation } from './mapLocation'
import type { Performer, PerformerAppearance } from './types'

export type LiveMapPerformer = Performer & { liveMapLabel?: string }

/** Visibility is independent of GPS permission or freshness. Never invent a location. */
export function discoverMapLives(performers: Performer[], appearances: PerformerAppearance[], now: number) {
  const live = performers.filter(p => p.is_approved && p.is_live && !p.is_private_test)
  const markers: LiveMapPerformer[] = []
  for (const performer of live) {
    if (isFreshLiveLocation(performer, now)
      && Math.abs(performer.lat!) <= 90 && Math.abs(performer.lng!) <= 180) {
      markers.push(performer)
      continue
    }
    // Only an ongoing public appearance may supply an approximate venue location.
    // Future, past, private and conflicting simultaneous venues are not evidence.
    const current = appearances.filter(a => a.performer_id === performer.id
      && a.status === 'published' && Date.parse(a.starts_at) <= now
      && a.ends_at != null && now < Date.parse(a.ends_at))
    if (current.length !== 1) continue
    const point = resolveAppearanceLocation(current[0])
    if (!point) continue
    markers.push({ ...performer, lat: point.lat, lng: point.lng,
      liveMapLabel: `概略位置：公開出演場所 ${current[0].venue_name}（現在地未確認）` })
  }
  return { live, markers }
}
