import type { PerformerAppearance } from './types'

export type AppearanceLocationInput = Pick<PerformerAppearance, 'venue_lat' | 'venue_lng' | 'venue_name' | 'venue_address' | 'region' | 'country'>
export type AppearanceLocation = { lat: number; lng: number; precision: 'registered' | 'approximate'; label: string; sourceUrl?: string }
const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
const japaneseCountry = (s: string) => ['', 'jp', 'jpn', 'japan', '日本'].includes(normalize(s))
export function validAppearanceCoordinates(lat: number | null | undefined, lng: number | null | undefined): lat is number {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

// Reviewed representatives only. These are display data, never written to an appearance.
// Sources, address evidence, resolution limits and verification date: docs/appearance-location/README.md.
const representatives = [
  { aliases: ['大須ふれあい広場', '大須商店街ふれあい広場'], context: /^(愛知|名古屋|大須)/, addressPattern: /大須(3|三)丁目(26|二十六)/,
    lat: 35.159256, lng: 136.903076, label: '大須3丁目26周辺（会場住所の概略）',
    sourceUrl: 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=愛知県名古屋市中区大須三丁目26' },
  { aliases: ['ランドマークタワー', '横浜ランドマークタワー'], context: /^(神奈川|横浜|みなとみらい)/, addressPattern: null,
    lat: 35.455093, lng: 139.631454, label: '横浜ランドマークタワー周辺',
    sourceUrl: 'https://yokohama-landmark.jp/access/' },
] as const
const cities = [
  { aliases: ['yokohama', '横浜', '横浜市', '神奈川県横浜市'], prefix: /^(神奈川県)?横浜市/,
    context: /^(神奈川|横浜|みなとみらい)/, lat: 35.450195, lng: 139.634903, label: '横浜市の代表地点（市庁舎周辺）',
    sourceUrl: 'https://www.city.yokohama.lg.jp/shichosha/' },
  { aliases: ['南相馬市', '福島県南相馬市'], prefix: /^(福島県)?南相馬市/,
    context: /^(福島|南相馬)/, lat: 37 + 38 / 60 + 32 / 3600, lng: 140 + 57 / 60 + 26 / 3600,
    label: '南相馬市の代表地点', sourceUrl: 'https://www.city.minamisoma.lg.jp/portal/admin/minamisomashinitsuite/index.html' },
] as const

export function resolveAppearanceLocation(row: AppearanceLocationInput): AppearanceLocation | null {
  if (validAppearanceCoordinates(row.venue_lat, row.venue_lng)) return { lat: row.venue_lat!, lng: row.venue_lng!, precision: 'registered', label: row.venue_name }
  // An invalid/partial explicit pair is not replaced with a guessed position.
  if (row.venue_lat != null || row.venue_lng != null || !japaneseCountry(row.country)) return null
  const venue = normalize(row.venue_name)
  const region = normalize(row.region)
  const address = normalize(row.venue_address)
  const explicitVenueArea = /^(東京都|大阪府|京都府|北海道|[一-龥]{2,3}県|横浜市|南相馬市|名古屋市)/.test(venue) ? venue : ''
  const compatible = (pattern: RegExp) => [region, address, explicitVenueArea].every(value => !value || pattern.test(value))
  const place = representatives.find(item => item.aliases.some(alias => normalize(alias) === venue) && compatible(item.context))
  // The Osu representative is for the supplied block, not a verified plaza stage.
  if (place && (!place.addressPattern || place.addressPattern.test(address))) {
    return { lat: place.lat, lng: place.lng, precision: 'approximate', label: place.label, sourceUrl: place.sourceUrl }
  }
  const city = cities.find(item => compatible(item.context) && (
    item.aliases.some(alias => normalize(alias) === venue || normalize(alias) === region)
    || item.prefix.test(venue) || item.prefix.test(address)
  ))
  return city ? { lat: city.lat, lng: city.lng, precision: 'approximate', label: city.label, sourceUrl: city.sourceUrl } : null
}

export function appearanceGoogleMapsUrl(row: AppearanceLocationInput, location = resolveAppearanceLocation(row)) {
  if (location?.precision === 'registered') return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`
  // Approximate positions are not advertised as an exact route to the performance.
  const query = [row.venue_name, row.venue_address, row.region, row.country].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
