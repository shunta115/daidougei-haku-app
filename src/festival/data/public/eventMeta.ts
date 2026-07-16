/**
 * 公開βのイベント基本情報。
 * 開催が決まったらこのファイルだけ編集してください（勝手な架空日程は入れないこと）。
 */
export type PublicEventMeta = {
  eventNameJa: string
  eventNameEn: string
  /** 表示用（例: 11.07–11.09）。未定なら空文字 */
  dateLabel: string
  /** 会場・エリア表示。未定なら空文字 */
  placeLabel: string
  /** 通常 / 雨天 などの運営メモ（短文） */
  weatherNote: string
  /** true のときヘッダーに LIVE ピルを出せる（実配信がある場合のみ） */
  allowLivePill: boolean
}

export const PUBLIC_EVENT_META: PublicEventMeta = {
  eventNameJa: '大道芸博',
  eventNameEn: 'Street Performance Expo',
  dateLabel: '',
  placeLabel: '',
  weatherNote: '開催情報は準備が整い次第、反映されます',
  allowLivePill: false,
}
