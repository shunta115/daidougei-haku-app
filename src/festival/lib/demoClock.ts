import { useDemoClock } from '../config/runtimeConfig'

/** デモ固定時刻（Asia/Tokyo）。公開モードでは使用しない。 */
export const DEMO_FIXED_ISO = '2026-11-08T15:12:00+09:00'

export const APP_TIME_ZONE = 'Asia/Tokyo'

/**
 * アプリ共通の「現在時刻」。
 * デモモードのみ固定時刻、公開モードは実時刻。
 */
export function getAppNow(): Date {
  if (useDemoClock) {
    return new Date(DEMO_FIXED_ISO)
  }
  return new Date()
}

/** @deprecated 互換用 — getAppNow を使用 */
export function getDemoNow(): Date {
  return getAppNow()
}

/** Asia/Tokyo の YYYY-MM-DD */
export function formatTokyoDate(d: Date = getAppNow()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** スケジュール枠の日時を Asia/Tokyo 壁時計として解釈 */
export function tokyoWallDate(dateYmd: string, hm: string): Date {
  const [h = '00', m = '00'] = hm.split(':')
  return new Date(`${dateYmd}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00+09:00`)
}
