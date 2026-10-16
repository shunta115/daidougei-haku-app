import { describe, expect, it, vi } from 'vitest'
import { markPerformerPayout } from '../api/stripe/_payouts'

describe('connected account bank payout ledger', () => {
  it('upserts the bank payout without changing an unrelated Transfer row', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const update = vi.fn()
    const sb = {
      from: (table: string) => {
        if (table === 'performers') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: 'performer-1' }, error: null }) }),
            }),
          }
        }
        if (table === 'connected_account_payouts') return { upsert }
        if (table === 'performer_payouts') return { update }
        throw new Error(`unexpected table: ${table}`)
      },
    }

    await markPerformerPayout(sb as never, {
      id: 'po_1', amount: 12_345, currency: 'jpy', arrival_date: 1_797_000_000,
      failure_code: null, failure_message: null, metadata: {},
    } as never, 'acct_1', 'paid')

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      connected_account_id: 'acct_1', performer_id: 'performer-1', stripe_payout_id: 'po_1',
      amount_yen: 12_345, currency: 'jpy', status: 'paid',
    }), { onConflict: 'connected_account_id,stripe_payout_id' })
    expect(update).not.toHaveBeenCalled()
  })
})
