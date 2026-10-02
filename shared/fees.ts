/** HAKU system-use fees in basis points. Server checkout is authoritative. */
export const TIP_SYSTEM_FEE_BPS = 1500
export const MERCH_SYSTEM_FEE_BPS = 800
export const MAX_SYSTEM_FEE_BPS = 5000

export const TIP_SYSTEM_FEE_PERCENT = 15
export const MERCH_SYSTEM_FEE_PERCENT = 8

/** @deprecated Use TIP_SYSTEM_FEE_BPS. Kept as alias for older imports. */
export const PLATFORM_FEE_BPS = TIP_SYSTEM_FEE_BPS

export function systemFeeYen(amountYen: number, feeBps: number): number {
  if (!Number.isInteger(amountYen) || amountYen <= 0) return 0
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_SYSTEM_FEE_BPS) return 0
  return Math.floor((amountYen * feeBps) / 10000)
}

export function bpsToPercentLabel(bps: number): string {
  const n = bps / 100
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
