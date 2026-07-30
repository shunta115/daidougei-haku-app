/** Tip gift overlay thresholds & labels — edit here (or later wire to admin). */

export type TipGiftTier = 'normal' | 'premium' | 'special'

export const TIP_GIFT_THRESHOLDS = {
  /** ¥100–¥999 */
  normalMax: 999,
  /** ¥1,000–¥4,999 */
  premiumMax: 4999,
  /** ¥5,000+ → special */
} as const

export function tipGiftTier(amountYen: number): TipGiftTier {
  if (amountYen >= TIP_GIFT_THRESHOLDS.premiumMax + 1) return 'special'
  if (amountYen >= TIP_GIFT_THRESHOLDS.normalMax + 1) return 'premium'
  return 'normal'
}

export function tipGiftLabel(amountYen: number, tier: TipGiftTier): string {
  if (tier === 'special') return 'スペシャルギフト'
  if (tier === 'premium') return '豪華ギフト'
  if (amountYen >= 500) return '応援ギフト'
  return '投げ銭'
}

export const TIP_GIFT_DURATIONS_MS: Record<TipGiftTier, number> = {
  normal: 3200,
  premium: 4500,
  special: 6200,
}
