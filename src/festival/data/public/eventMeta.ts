/**
 * 公開イベントのフォールバック（DB 未適用時）。
 * アプリ名は大道芸博。イベント名は「受賞者たち」。
 */
export type PublicEventMeta = {
  eventNameJa: string
  eventNameEn: string
  presenterJa: string
  presenterEn: string
  /** 表示用（例: 10.10–10.12）。未定なら空文字 */
  dateLabel: string
  /** 会場・エリア表示。未定なら空文字 */
  placeLabel: string
  /** 開場時間。未定なら空文字 */
  hoursLabel: string
  /** 公式サイト。未定なら空文字 */
  officialUrl: string
  /** 通常 / 雨天 などの運営メモ（短文） */
  weatherNote: string
  /** true のときヘッダーに LIVE ピルを出せる（実配信がある場合のみ） */
  allowLivePill: boolean
}

export const PUBLIC_EVENT_META: PublicEventMeta = {
  eventNameJa: '受賞者たち',
  eventNameEn: 'Award Winning Performers',
  presenterJa: 'Presented by 大道芸博 2026',
  presenterEn: 'Presented by Daidougei Haku 2026',
  dateLabel: '10.10–10.12',
  placeLabel: '東京 練馬城址公園',
  hoursLabel: '',
  officialUrl: '',
  weatherNote: '出演者情報・タイムテーブルは近日公開です。確定分から順次掲載します。',
  allowLivePill: true,
}

export const APP_BRAND_JA = '大道芸博'
export const APP_BRAND_EN = 'Daidougei Haku'
