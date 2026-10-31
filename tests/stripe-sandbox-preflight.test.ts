import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { verifySettlementPermissions } from './stripe-sandbox/preflight'

function sandbox(live = false, denied = false) {
  const listSessions = vi.fn().mockResolvedValue({ data: [{ livemode: live }] })
  const listBalances = denied
    ? vi.fn().mockRejectedValue(new Error('permission_denied'))
    : vi.fn().mockResolvedValue({ data: [] })
  return { client: { checkout: { sessions: { list: listSessions } }, balanceTransactions: { list: listBalances } } as unknown as Stripe, listBalances }
}

describe('paid Sandbox acceptance preflight', () => {
  it('accepts an empty Sandbox only after actual-fee permission succeeds', async () => {
    const { client, listBalances } = sandbox()
    await expect(verifySettlementPermissions(client)).resolves.toEqual({ checkoutRead: true, actualFeeRead: true })
    expect(listBalances).toHaveBeenCalledWith({ limit: 1 })
  })
  it('refuses insufficient actual-fee permissions before payment', async () => {
    await expect(verifySettlementPermissions(sandbox(false, true).client)).rejects.toThrow('permission_denied')
  })
  it('refuses a live Checkout returned by a misconfigured credential', async () => {
    await expect(verifySettlementPermissions(sandbox(true).client)).rejects.toThrow('live_stripe_session_refused')
  })
})
