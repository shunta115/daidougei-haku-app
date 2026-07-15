export type RecommendedRouteCourseId = 'first' | 'family' | 'fan' | 'rain'

export type RecommendedRouteCourse = {
  id: RecommendedRouteCourseId
  eyebrowEn: string
  titleJa: string
  blurbJa: string
  durationMin: number
  venueIds: readonly string[]
  performerIds: readonly string[]
  restStopsJa: readonly string[]
}

export const RECOMMENDED_ROUTE_COURSES: readonly RecommendedRouteCourse[] = [
  {
    id: 'first',
    eyebrowEn: 'FIRST TIMER',
    titleJa: '初めての人向け',
    blurbJa: '歩幅ゆったり · シグナルが分かりやすい王道だけ',
    durationMin: 90,
    venueIds: ['street-a', 'main-lawn', 'queens-plaza'],
    performerIds: ['3', '1', '4'],
    restStopsJa: ['ストリートA ベンチ', '芝生端のキオスク前'],
  },
  {
    id: 'family',
    eyebrowEn: 'FAMILY',
    titleJa: '親子向け',
    blurbJa: '見やすい高さ · 休憩多め · 驚きはソフトに',
    durationMin: 75,
    venueIds: ['main-lawn', 'street-a', 'canal-walk'],
    performerIds: ['3', '5', '1'],
    restStopsJa: ['芝生ピクニックゾーン', '屋台エリア'],
  },
  {
    id: 'fan',
    eyebrowEn: 'HEADLINER',
    titleJa: 'ガチ大道芸ファン向け',
    blurbJa: '熱量MAXの広場と運河のコントラスト',
    durationMin: 120,
    venueIds: ['queens-plaza', 'main-lawn', 'canal-walk', 'street-a'],
    performerIds: ['2', '1', '4', '5'],
    restStopsJa: ['クイーンズ前の階段', '運河のネオン帯'],
  },
  {
    id: 'rain',
    eyebrowEn: 'RAIN PLAN',
    titleJa: '雨でも楽しむ',
    blurbJa: '屋内移動枠と屋根付き動線を優先',
    durationMin: 60,
    venueIds: ['street-a', 'queens-plaza'],
    performerIds: ['3', '5'],
    restStopsJa: ['アーケード下のベンチ列'],
  },
] as const
