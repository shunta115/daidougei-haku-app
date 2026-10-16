export const MIN_PAYOUT_YEN = 10_000

export function refundKind(grossYen: number, refundedYen: number): 'none' | 'partial' | 'full' {
  if (!Number.isInteger(grossYen) || grossYen <= 0) return refundedYen > 0 ? 'full' : 'none'
  if (!Number.isInteger(refundedYen) || refundedYen <= 0) return 'none'
  return refundedYen >= grossYen ? 'full' : 'partial'
}

export function refundSaleStatus(grossYen: number, refundedYen: number): 'succeeded' | 'refunded' {
  return refundKind(grossYen, refundedYen) === 'full' ? 'refunded' : 'succeeded'
}

export function isOpenDispute(disputeStatus: string | null | undefined): boolean {
  if (!disputeStatus) return false
  return !['won', 'warning_closed'].includes(disputeStatus)
}

export function remainingShareYen(args: {
  performerShareYen: number
  grossYen: number
  refundedYen: number
  stripeFeeYen?: number
  feeBps?: number
  status?: string
  disputeStatus?: string | null
}): number {
  if (isOpenDispute(args.disputeStatus)) return 0
  if (args.status === 'refunded' || args.status === 'failed' || args.status === 'expired' || args.status === 'pending') return 0
  if (!Number.isInteger(args.performerShareYen) || args.performerShareYen <= 0) return 0
  if (!Number.isInteger(args.grossYen) || args.grossYen <= 0) return 0
  const refunded = Number.isInteger(args.refundedYen) && args.refundedYen > 0 ? args.refundedYen : 0
  if (refunded <= 0) return args.performerShareYen
  if (refunded >= args.grossYen) return 0
  if (Number.isInteger(args.stripeFeeYen) && Number.isInteger(args.feeBps)) {
    return settleSaleAfterRefund(args.grossYen, args.stripeFeeYen ?? 0, refunded, args.feeBps ?? 0).performerShareYen
  }
  return Math.floor((args.performerShareYen * (args.grossYen - refunded)) / args.grossYen)
}

export function eligiblePayoutYen(hakuAvailableYen: number, stripeAvailableYen: number): number {
  if (!Number.isInteger(hakuAvailableYen) || hakuAvailableYen < 0) return 0
  if (!Number.isInteger(stripeAvailableYen) || stripeAvailableYen < 0) return 0
  return Math.min(hakuAvailableYen, stripeAvailableYen)
}

export function canRequestPayout(eligibleYen: number, minYen = MIN_PAYOUT_YEN): boolean {
  return Number.isInteger(eligibleYen) && eligibleYen >= minYen
}

export function remainingToMinPayout(eligibleYen: number, minYen = MIN_PAYOUT_YEN): number {
  const current = Number.isInteger(eligibleYen) ? Math.max(0, eligibleYen) : 0
  return Math.max(0, minYen - current)
}
import { settleSaleAfterRefund } from './fees.js'
