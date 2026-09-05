import type { VenueArea } from '../../types'

/**
 * 公開モードの会場。
 * 実会場のみ。crowd は実測がない場合は省略（混雑デモは出ません）。
 */
export const PUBLIC_VENUES: VenueArea[] = [
  {
    id: 'nerima-joshi-park',
    nameJa: '練馬城址公園',
    nameEn: 'Nerima Joshi Park',
    blurbJa: '東京・練馬。「受賞者たち」の会場。',
    blurbEn: 'Nerima, Tokyo. Venue for Award Winning Performers.',
    gradient: 'linear-gradient(160deg, #061018 0%, #0e2a22 42%, #2bffdd 92%)',
    lat: 35.7508,
    lng: 139.6375,
  },
]
