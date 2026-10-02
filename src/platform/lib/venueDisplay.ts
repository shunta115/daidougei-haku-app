/** Google Maps place エントランス交流ゾーン — /g/11ty6fzg9q, Plus Code PJVW+9R */
export const AWP_ENTRANCE_ZONE = {
  name_ja: '練馬城址公園',
  zone_ja: 'エントランス交流ゾーン',
  lat: 35.7434302,
  lng: 139.6470773,
} as const

export function venueMapLabel(venue: { name_ja: string; blurb_ja?: string | null }) {
  const zone = venue.blurb_ja?.trim()
  if (!zone || venue.name_ja.includes(zone)) return venue.name_ja
  return `${venue.name_ja} ${zone}`
}
