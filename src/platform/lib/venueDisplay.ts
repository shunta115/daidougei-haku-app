import { AWP_EVENT_SLUG } from '../../app/routes'
import { PUBLIC_EVENT_META } from '../../festival/data/public/eventMeta'

/** Google Maps place エントランス交流ゾーン — /g/11ty6fzg9q, Plus Code PJVW+9R */
export const AWP_ENTRANCE_ZONE = {
  name_ja: '練馬城址公園',
  zone_ja: 'エントランス交流ゾーン',
  lat: 35.7434302,
  lng: 139.6470773,
} as const

type EventNameSource = {
  slug?: string | null
  name_ja?: string | null
  name_en?: string | null
  hero_kicker_ja?: string | null
  starts_on?: string | null
}

export function venueMapLabel(venue: { name_ja: string; blurb_ja?: string | null }) {
  const zone = venue.blurb_ja?.trim()
  if (!zone || venue.name_ja.includes(zone)) return venue.name_ja
  return `${venue.name_ja} ${zone}`
}

export function eventMapMarkerLabel(event: EventNameSource | null) {
  const kicker = event?.hero_kicker_ja?.trim()
  if (kicker && kicker.length <= 6) return kicker
  const slug = event?.slug || AWP_EVENT_SLUG
  if (slug === AWP_EVENT_SLUG || slug.includes('award-winning')) return 'AWP'
  const initials = (event?.name_en || '').split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 4).toUpperCase()
  return initials || (event?.name_ja || 'HAKU').slice(0, 3)
}

export function eventVenueCardTitle(event: EventNameSource | null, lang: 'ja' | 'en' | 'zh-TW') {
  const shortName = eventMapMarkerLabel(event)
  const year = (event?.starts_on || '2026-10-10').slice(0, 4)
  const name = lang === 'en'
    ? (event?.name_en || PUBLIC_EVENT_META.eventNameEn)
    : (event?.name_ja || PUBLIC_EVENT_META.eventNameJa)
  if (lang === 'en') return `${shortName} ${year} “${name}”`
  return `${shortName} ${year}「${name}」`
}
