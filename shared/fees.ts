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

/** N = max(0, G − S). HAKU fee is taken from N, not from G. */
export function netAfterStripeFee(grossYen: number, stripeFeeYen: number): number {
  if (!Number.isInteger(grossYen) || grossYen < 0) return 0
  if (!Number.isInteger(stripeFeeYen) || stripeFeeYen < 0) return 0
  return Math.max(0, grossYen - stripeFeeYen)
}

export function settleSale(grossYen: number, stripeFeeYen: number, feeBps: number) {
  const netYen = netAfterStripeFee(grossYen, stripeFeeYen)
  const hakuFeeYen = systemFeeYen(netYen, feeBps)
  return {
    grossYen: Number.isInteger(grossYen) && grossYen > 0 ? grossYen : 0,
    stripeFeeYen: Number.isInteger(stripeFeeYen) && stripeFeeYen > 0 ? stripeFeeYen : 0,
    netYen,
    hakuFeeYen,
    performerShareYen: Math.max(0, netYen - hakuFeeYen),
  }
}

export function applicationFeeOverageYen(collectedAppFeeYen: number, desiredHakuFeeYen: number): number {
  if (!Number.isInteger(collectedAppFeeYen) || collectedAppFeeYen < 0) return 0
  if (!Number.isInteger(desiredHakuFeeYen) || desiredHakuFeeYen < 0) return 0
  return Math.max(0, collectedAppFeeYen - desiredHakuFeeYen)
}

export function bpsToPercentLabel(bps: number): string {
  const n = bps / 100
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
