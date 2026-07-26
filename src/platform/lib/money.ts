/** Platform fee in basis points (1000 = 10%) */
export const PLATFORM_FEE_BPS = 1000

export const TIP_PRESETS_JPY = [500, 1000, 3000, 5000] as const

export function calcPlatformFee(amountCents: number): number {
  return Math.floor((amountCents * PLATFORM_FEE_BPS) / 10000)
}

export function formatYen(centsOrYen: number): string {
  // Stripe JPY uses yen as smallest unit (no cents)
  return `¥${centsOrYen.toLocaleString('ja-JP')}`
}
