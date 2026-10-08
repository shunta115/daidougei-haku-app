import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  tips: [] as Array<Record<string, unknown>>,
  orders: [] as Array<Record<string, unknown>>,
  payouts: [] as Array<Record<string, unknown>>,
  insertError: null as { code?: string; message: string } | null,
  inserted: null as Record<string, unknown> | null,
  stripeAvailable: 20_000,
  createTransfer: vi.fn(),
  selectedColumns: {} as Record<string, string>,
}))

vi.mock('../api/stripe/_shared.js', () => ({}))

vi.mock('../api/stripe/_settlement.js', async () => {
  const actual = await vi.importActual<typeof import('../api/stripe/_settlement.js')>('../api/stripe/_settlement.js')
  return actual
})

import { requestPerformerPayout } from '../api/stripe/_payouts'

function selectTable(table: string) {
  if (table === 'tips') return { data: fake.tips, error: null }
  if (table === 'merch_orders') return { data: fake.orders, error: null }
  if (table === 'performer_payouts') return { data: fake.payouts, error: null }
  return { data: [], error: null }
}

const sb = {
  from: (table: string) => ({
    select: (columns: string) => {
      fake.selectedColumns[table] = columns
      return {
        eq: () => {
          const result = selectTable(table)
          return {
            order: () => ({
              limit: async () => result,
            }),
            then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
              Promise.resolve(result).then(resolve, reject),
          }
        },
      }
    },
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        maybeSingle: async () => {
          if (fake.insertError) return { data: null, error: fake.insertError }
          fake.inserted = { id: 'payout-row', ...row }
          fake.payouts = [{ ...fake.inserted, created_at: '2026-10-03T00:00:00Z' }]
          return { data: fake.inserted, error: null }
        },
      }),
    }),
    update: () => ({
      eq: () => ({
        eq: async () => ({ error: null }),
        select: () => ({ maybeSingle: async () => ({ data: { id: 'payout-row' }, error: null }) }),
      }),
    }),
  }),
}

const stripe = {
  balance: { retrieve: async () => ({ available: [{ currency: 'jpy', amount: fake.stripeAvailable }] }) },
  transfers: { create: (...args: unknown[]) => fake.createTransfer(...args) },
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'
  fake.tips = [{ id: 't1', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 12000, performer_share_yen: 10000, refunded_amount_yen: 0, dispute_status: null }]
  fake.orders = []
  fake.payouts = []
  fake.insertError = null
  fake.inserted = null
  fake.stripeAvailable = 20_000
  fake.createTransfer.mockResolvedValue({ id: 'tr_test' })
  fake.selectedColumns = {}
})

describe('requestPerformerPayout', () => {
  it('rejects 9,999 and pays 10,000 once', async () => {
    fake.tips = [{ id: 't1', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 12000, performer_share_yen: 9999, refunded_amount_yen: 0 }]
    const blocked = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(blocked.status).toBe(400)
    expect(fake.createTransfer).not.toHaveBeenCalled()

    fake.tips = [{ id: 't1', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 12000, performer_share_yen: 10000, refunded_amount_yen: 0 }]
    const ok = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(ok.status).toBe(200)
    expect(fake.createTransfer).toHaveBeenCalledTimes(1)
    expect(fake.createTransfer.mock.calls[0][0]).toMatchObject({ amount: 10000, destination: 'acct_1' })
  })

  it('does not create a second payout while one is reserved', async () => {
    fake.payouts = [{ id: 'open', amount_yen: 10000, status: 'reserved', stripe_payout_id: 'po_open', created_at: '2026-10-03T00:00:00Z' }]
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(409)
    expect(fake.createTransfer).not.toHaveBeenCalled()
  })

  it('treats a unique-constraint collision as an in-flight payout', async () => {
    fake.insertError = { code: '23505', message: 'duplicate' }
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(409)
    expect(fake.createTransfer).not.toHaveBeenCalled()
  })

  it('blocks live-mode bank payouts', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_fixture'
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(403)
    expect(fake.createTransfer).not.toHaveBeenCalled()
  })

  it('uses the lower Stripe available balance', async () => {
    fake.stripeAvailable = 8000
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(400)
    expect(fake.createTransfer).not.toHaveBeenCalled()
  })

  it('does not pay an unfinalized settlement even when a share value exists', async () => {
    fake.tips = [{ id: 't1', status: 'succeeded', settlement_status: 'fee_adjust_failed', gross_amount_yen: 12000, performer_share_yen: 10000, refunded_amount_yen: 0 }]
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(400)
    expect(fake.createTransfer).not.toHaveBeenCalled()
  })

  it('loads actual fee and fee rate columns needed to recalculate a partial refund', async () => {
    fake.tips = [{
      id: 't1', status: 'succeeded', settlement_status: 'settled',
      gross_amount_yen: 12_000, stripe_fee_yen: 400, haku_fee_bps: 1500,
      performer_share_yen: 9860, refunded_amount_yen: 2000, dispute_status: null,
    }]
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ availableYen: 8160 })
    expect(fake.selectedColumns.tips).toContain('stripe_fee_yen')
    expect(fake.selectedColumns.tips).toContain('haku_fee_bps')
    expect(fake.selectedColumns.merch_orders).toContain('stripe_fee_yen')
    expect(fake.selectedColumns.merch_orders).toContain('haku_fee_bps')
    expect(fake.createTransfer).not.toHaveBeenCalled()
  })

  it('releases the reserved row when Stripe payout creation fails', async () => {
    fake.createTransfer.mockRejectedValue(new Error('insufficient_funds'))
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(409)
    expect(fake.createTransfer).toHaveBeenCalledTimes(1)
  })

  it('does not create a second Stripe payout after the first create succeeds', async () => {
    const first = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(first.status).toBe(200)
    const second = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(second.status).toBe(409)
    expect(fake.createTransfer).toHaveBeenCalledTimes(1)
  })
})
