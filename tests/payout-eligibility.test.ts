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
  it('has no HAKU threshold while still rejecting a zero-value Transfer', () => {
    expect(MIN_PAYOUT_YEN).toBe(1)
    expect(canRequestPayout(0)).toBe(false)
    expect(canRequestPayout(1)).toBe(true)
    expect(canRequestPayout(9_999)).toBe(true)
    expect(remainingToMinPayout(0)).toBe(1)
    expect(remainingToMinPayout(1)).toBe(0)
  })

  it('uses the lower of HAKU available and Stripe available', () => {
    expect(eligiblePayoutYen(12_000, 8_000)).toBe(8_000)
    expect(eligiblePayoutYen(8_000, 12_000)).toBe(8_000)
    expect(canRequestPayout(eligiblePayoutYen(12_000, 8_000))).toBe(true)
    expect(canRequestPayout(eligiblePayoutYen(12_000, 10_000))).toBe(true)
    expect(eligiblePayoutYen(-1, 20_000)).toBe(0)
  })

  it('excludes refunds and open disputes from available balance', () => {
    expect(refundSaleStatus(1000, 0)).toBe('succeeded')
    expect(refundSaleStatus(1000, 300)).toBe('succeeded')
    expect(refundSaleStatus(1000, 1000)).toBe('refunded')
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 0 })).toBe(820)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 500 })).toBe(410)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 500, stripeFeeYen: 36, feeBps: 1500 })).toBe(395)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 1000 })).toBe(0)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 0, disputeStatus: 'needs_response' })).toBe(0)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 0, disputeStatus: 'won' })).toBe(820)
    expect(remainingShareYen({ performerShareYen: 820, grossYen: 1000, refundedYen: 0, status: 'refunded' })).toBe(0)
  })
})
