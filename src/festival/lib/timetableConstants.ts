/** タイムテーブル会場フィルター（実データの venueId に対応） */
export const TIMETABLE_VENUE_CHIPS = [
  { id: 'all', labelJa: '全会場' },
  { id: 'main-lawn', labelJa: 'メイン芝生', hintJa: '芝生エリア' },
  { id: 'street-a', labelJa: 'ストリートA', hintJa: 'サブステージ' },
  { id: 'queens-plaza', labelJa: 'クイーンズ前', hintJa: 'メインステージ' },
  { id: 'canal-walk', labelJa: '運河ウォーク' },
] as const

/** ジャンルフィルター（データに無いジャンルも UI 用に表示） */
export const TIMETABLE_GENRE_CHIPS = [
  { id: 'all', labelJa: 'すべて' },
  { id: 'ジャグリング', labelJa: 'ジャグリング' },
  { id: 'アクロバット', labelJa: 'アクロバット' },
  { id: 'マジック', labelJa: 'マジック' },
  { id: 'パントマイム', labelJa: 'パントマイム' },
  { id: 'ファイア / ダンス', labelJa: 'ファイア' },
  { id: 'マイム / サイレント', labelJa: 'マイム' },
  { id: '音楽 × 空中', labelJa: '音楽 × 空中' },
] as const

export type TimetableScheduleMode = 'normal' | 'rain'
