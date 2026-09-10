/** Platform fee in basis points (1000 = 10%) */
export const PLATFORM_FEE_BPS = 1000

export const TIP_PRESETS_JPY = [300, 500, 1000, 3000] as const

export const TIP_PRESET_LABELS_JA: Record<(typeof TIP_PRESETS_JPY)[number], { label: string; note?: string }> = {
  300: { label: '👏 NICE' },
  500: { label: '🔥 BRAVO', note: 'おすすめ' },
  1000: { label: '❤️ AMAZING' },
  3000: { label: '👑 LEGEND' },
}

export function calcPlatformFee(amountCents: number): number {
  return Math.floor((amountCents * PLATFORM_FEE_BPS) / 10000)
}

export function formatYen(centsOrYen: number): string {
  // Stripe JPY uses yen as smallest unit (no cents)
  return `¥${centsOrYen.toLocaleString('ja-JP')}`
}
