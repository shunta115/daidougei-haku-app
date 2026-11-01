import { expect, it } from 'vitest'
import { estimateLiveTransfer } from '../shared/liveBandwidth'
it('accounts for all 500 viewers and three daily one-hour streams', () => {
  const m = estimateLiveTransfer({ videoBps: 2500000, audioBps: 48000, viewers: 500 })
  expect(m.receiverGBPerHour).toBeCloseTo(1.31859)
  expect(m.serverOutboundGBPerHour).toBeCloseTo(659.295)
  expect(m.serverOutboundGBPerMonth).toBeCloseTo(59336.55)
  expect(m.serverOutboundMbps).toBeCloseTo(1465.1)
  expect(m.verifiedAdditionalYen).toBeNull()
})
it('scales performers, duration and empty audiences explicitly', () => {
  expect(estimateLiveTransfer({ videoBps: 1700000, audioBps: 96000, viewers: 0 }).serverOutboundGBPerMonth).toBe(0)
  const a = estimateLiveTransfer({ videoBps: 1700000, audioBps: 96000, viewers: 500 })
  const b = estimateLiveTransfer({ videoBps: 1700000, audioBps: 96000, viewers: 500, performers: 2 })
  expect(b.serverOutboundGBPerMonth).toBe(2 * a.serverOutboundGBPerMonth)
})
it.each([-1, NaN, Infinity])('rejects invalid planning inputs %s', viewers => {
  expect(() => estimateLiveTransfer({ videoBps: 1, audioBps: 1, viewers })).toThrow()
})
