import { TIP_SYSTEM_FEE_BPS, systemFeeYen } from '../../../shared/fees'

/** @deprecated Client must not price checkout. Display-only fallback = tip system-use bps. */
export const PLATFORM_FEE_BPS = TIP_SYSTEM_FEE_BPS

export const TIP_PRESETS_JPY = [300, 500, 1000, 3000] as const

export const TIP_PRESET_LABELS_JA: Record<(typeof TIP_PRESETS_JPY)[number], { label: string; note?: string }> = {
  300: { label: '👏 NICE' },
  500: { label: '🔥 BRAVO', note: 'おすすめ' },
  1000: { label: '❤️ AMAZING' },
  3000: { label: '👑 LEGEND' },
}

export function calcPlatformFee(amountCents: number, feeBps = PLATFORM_FEE_BPS): number {
  return systemFeeYen(amountCents, feeBps)
}

export function formatYen(centsOrYen: number): string {
  // Stripe JPY uses yen as smallest unit (no cents)
  return `¥${centsOrYen.toLocaleString('ja-JP')}`
}
