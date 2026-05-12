/**
 * デモ用の「現在時刻」。本番では new Date() またはサーバー時刻に差し替え。
 */
export function getDemoNow(): Date {
  return new Date('2026-11-08T15:12:00+09:00')
}
