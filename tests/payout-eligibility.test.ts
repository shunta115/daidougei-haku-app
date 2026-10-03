import { describe, expect, it } from 'vitest'
import {
  MIN_PAYOUT_YEN,
  canRequestPayout,
  eligiblePayoutYen,
  refundSaleStatus,
  remainingShareYen,
  remainingToMinPayout,
} from '../shared/payoutMath'

describe('performer payout eligibility', () => {
  it('blocks 9,999 and allows 10,000 and 10,001', () => {
    expect(MIN_PAYOUT_YEN).toBe(10_000)
    expect(canRequestPayout(9_999)).toBe(false)
    expect(canRequestPayout(10_000)).toBe(true)
    expect(canRequestPayout(10_001)).toBe(true)
    expect(remainingToMinPayout(6_760)).toBe(3_240)
    expect(remainingToMinPayout(10_000)).toBe(0)
  })

  it('uses the lower of HAKU available and Stripe available', () => {
    expect(eligiblePayoutYen(12_000, 8_000)).toBe(8_000)
    expect(eligiblePayoutYen(8_000, 12_000)).toBe(8_000)
    expect(canRequestPayout(eligiblePayoutYen(12_000, 8_000))).toBe(false)
    expect(canRequestPayout(eligiblePayoutYen(12_000, 10_000))).toBe(true)
    expect(eligiblePayoutYen(-1, 20_000)).toBe(0)
  })

  it('excludes refunds and open disputes from available balance', () => {
    expect(refundSaleStatus(1000, 0)).toBe('succeeded')
    expect(refundSaleStatus(1000, 300)).toBe('succeeded')
    expect(refundSaleStatus(1000, 1000)).toBe('refunded')
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 0 })).toBe(820)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 500 })).toBe(410)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 1000 })).toBe(0)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 0, disputeStatus: 'needs_response' })).toBe(0)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 0, disputeStatus: 'won' })).toBe(820)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 0, status: 'refunded' })).toBe(0)
  })
})
