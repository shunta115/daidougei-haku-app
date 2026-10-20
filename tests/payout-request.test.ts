import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  tips: [] as Array<Record<string, unknown>>,
  orders: [] as Array<Record<string, unknown>>,
  payouts: [] as Array<Record<string, unknown>>,
  insertError: null as { code?: string; message: string } | null,
  inserted: null as Record<string, unknown> | null,
  stripeAvailable: 20_000,
  createTransfer: vi.fn(),
  retrieveTransfer: vi.fn(),
  selectedColumns: {} as Record<string, string>,
}))

vi.mock('../api/stripe/_shared.js', () => ({}))

vi.mock('../api/stripe/_settlement.js', async () => {
  const actual = await vi.importActual<typeof import('../api/stripe/_settlement.js')>('../api/stripe/_settlement.js')
  return actual
})

import { getPerformerPayoutView, requestPerformerPayout } from '../api/stripe/_payouts'

function selectTable(table: string) {
  const classify = (rows: Array<Record<string, unknown>>) => rows.map((row, index) => ({
    stripe_session_id: `cs_live_fixture_${index}`,
    stripe_balance_transaction_id: `txn_fixture_${index}`,
    stripe_checkout_mode: 'platform_separate',
    ...row,
  }))
  if (table === 'tips') return { data: classify(fake.tips), error: null }
  if (table === 'merch_orders') return { data: classify(fake.orders), error: null }
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
    update: (patch: Record<string, unknown>) => ({
      eq: (_column: string, id: unknown) => ({
        eq: async () => {
          fake.payouts = fake.payouts.map((row) => row.id === id ? { ...row, ...patch } : row)
          return { error: null }
        },
        select: () => ({ maybeSingle: async () => ({ data: { id: 'payout-row' }, error: null }) }),
      }),
    }),
  }),
  rpc: (_name: string, args: Record<string, unknown>) => ({
    maybeSingle: async () => {
      if (fake.insertError) return { data: null, error: fake.insertError }
      fake.inserted = {
        id: 'payout-row', performer_id: args.p_performer_id, connected_account_id: args.p_connected_account_id,
        amount_yen: args.p_amount_yen, status: 'reserved', stripe_payout_id: null,
        idempotency_key: args.p_idempotency_key, created_at: '2026-10-03T00:00:00Z',
      }
      fake.payouts.push(fake.inserted)
      return { data: fake.inserted, error: null }
    },
  }),
}

const stripe = {
  balance: { retrieve: async () => ({ available: [{ currency: 'jpy', amount: fake.stripeAvailable }] }) },
  balanceTransactions: { retrieve: async () => ({ status: 'available', available_on: 0 }) },
  accounts: { retrieve: async () => ({ details_submitted: true, payouts_enabled: true, capabilities: { transfers: 'active' }, requirements: { currently_due: [], past_due: [] } }) },
  transfers: {
    create: (...args: unknown[]) => fake.createTransfer(...args),
    retrieve: (...args: unknown[]) => fake.retrieveTransfer(...args),
  },
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
  fake.createTransfer.mockImplementation(async (params: Record<string, unknown>) => ({
    id: 'tr_test', amount: params.amount, destination: params.destination, reversed: false,
    metadata: params.metadata,
  }))
  fake.retrieveTransfer.mockResolvedValue({
    id: 'tr_existing', amount: 10_000, destination: 'acct_1', reversed: false,
    metadata: { performer_id: 'p1', payout_row: 'open' },
  })
  fake.selectedColumns = {}
})

describe('requestPerformerPayout', () => {
  it('keeps an unregistered performer balance attributable by performer id', async () => {
    const view = await getPerformerPayoutView(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: null })
    expect(view.confirmedSalesYen).toBe(10_000)
    expect(view.hakuAvailableYen).toBe(10_000)
    expect(view.availableYen).toBe(10_000)
    expect(view.canPayout).toBe(false)
  })

  it('separates reserved, processing, completed, failed, and canceled transfers', async () => {
    fake.tips = [{ id: 't1', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 50_000, performer_share_yen: 50_000, refunded_amount_yen: 0 }]
    fake.payouts = [
      { id: 'r', amount_yen: 1_000, status: 'reserved', stripe_transfer_id: null, created_at: '2026-10-01T00:00:00Z' },
      { id: 'p', amount_yen: 2_000, status: 'reserved', stripe_transfer_id: 'tr_processing', created_at: '2026-10-02T00:00:00Z' },
      { id: 'd', amount_yen: 3_000, status: 'paid', stripe_transfer_id: 'tr_paid', created_at: '2026-10-03T00:00:00Z' },
      { id: 'f', amount_yen: 4_000, status: 'failed', stripe_transfer_id: null, created_at: '2026-10-04T00:00:00Z' },
      { id: 'c', amount_yen: 5_000, status: 'canceled', stripe_transfer_id: null, created_at: '2026-10-05T00:00:00Z' },
    ]
    const view = await getPerformerPayoutView(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(view).toMatchObject({ reservedYen: 1_000, processingYen: 2_000, pendingYen: 3_000, paidOutYen: 3_000, failedYen: 4_000, canceledYen: 5_000, hakuAvailableYen: 44_000 })
  })

  it('pays a positive balance below the former 10,000 yen threshold', async () => {
    fake.tips = [{ id: 't1', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 12000, performer_share_yen: 9999, refunded_amount_yen: 0 }]
    const ok = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(ok.status).toBe(200)
    expect(fake.createTransfer).toHaveBeenCalledTimes(1)
    expect(fake.createTransfer.mock.calls[0][0]).toMatchObject({ amount: 9999, destination: 'acct_1' })
  })

  it('retries the exact reserved payout with its existing idempotency key', async () => {
    fake.payouts = [{ id: 'open', amount_yen: 10000, status: 'reserved', stripe_payout_id: null, connected_account_id: 'acct_1', idempotency_key: 'same-key', created_at: '2026-10-03T00:00:00Z' }]
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(200)
    expect(fake.createTransfer).toHaveBeenCalledTimes(1)
    expect(fake.createTransfer.mock.calls[0][1]).toEqual({ idempotencyKey: 'same-key' })
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
    expect(res.status).toBe(200)
    expect(fake.createTransfer.mock.calls[0][0]).toMatchObject({ amount: 8000 })
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
    expect(res.status).toBe(200)
    expect(fake.selectedColumns.tips).toContain('stripe_fee_yen')
    expect(fake.selectedColumns.tips).toContain('haku_fee_bps')
    expect(fake.selectedColumns.merch_orders).toContain('stripe_fee_yen')
    expect(fake.selectedColumns.merch_orders).toContain('haku_fee_bps')
    expect(fake.createTransfer.mock.calls[0][0]).toMatchObject({ amount: 8160 })
  })

  it('keeps the reserved row when Stripe transfer status is ambiguous', async () => {
    fake.createTransfer.mockRejectedValue(new Error('insufficient_funds'))
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(409)
    expect(fake.createTransfer).toHaveBeenCalledTimes(1)
    expect(fake.payouts[0]).toMatchObject({ status: 'reserved', transfer_status: 'needs_reconciliation' })
  })

  it('retries a timed-out create with the same key and records only one transfer', async () => {
    fake.createTransfer
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({
        id: 'tr_after_timeout', amount: 10_000, destination: 'acct_1', reversed: false,
        metadata: { performer_id: 'p1', payout_row: 'payout-row' },
      })
    const first = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    const second = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(first.status).toBe(409)
    expect(second.status).toBe(200)
    expect(fake.createTransfer).toHaveBeenCalledTimes(2)
    expect(fake.createTransfer.mock.calls[0][1]).toEqual(fake.createTransfer.mock.calls[1][1])
    expect(fake.payouts[0]).toMatchObject({ status: 'paid', stripe_transfer_id: 'tr_after_timeout' })
  })

  it('retrieves a known Transfer instead of creating a second one', async () => {
    fake.payouts = [{
      id: 'open', amount_yen: 10_000, status: 'reserved', stripe_transfer_id: 'tr_existing',
      connected_account_id: 'acct_1', idempotency_key: 'same-key', transfer_status: 'needs_reconciliation',
      created_at: '2026-10-03T00:00:00Z',
    }]
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(200)
    expect(fake.retrieveTransfer).toHaveBeenCalledWith('tr_existing')
    expect(fake.createTransfer).not.toHaveBeenCalled()
    expect(fake.payouts[0]).toMatchObject({ status: 'paid', transfer_status: 'succeeded' })
  })

  it('keeps the reservation when the retrieved Transfer belongs to another payout', async () => {
    fake.payouts = [{
      id: 'open', amount_yen: 10_000, status: 'reserved', stripe_transfer_id: 'tr_existing',
      connected_account_id: 'acct_1', idempotency_key: 'same-key', transfer_status: 'needs_reconciliation',
      created_at: '2026-10-03T00:00:00Z',
    }]
    fake.retrieveTransfer.mockResolvedValue({
      id: 'tr_existing', amount: 10_000, destination: 'acct_other', reversed: false,
      metadata: { performer_id: 'other', payout_row: 'other-row' },
    })
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(409)
    expect(fake.createTransfer).not.toHaveBeenCalled()
    expect(fake.payouts[0]).toMatchObject({ status: 'reserved', transfer_status: 'needs_reconciliation' })
  })

  it('does not create a second Stripe payout after the first create succeeds', async () => {
    const first = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(first.status).toBe(200)
    const second = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(second.status).toBe(400)
    expect(fake.createTransfer).toHaveBeenCalledTimes(1)
  })

  it('allows 10,001 yen and carries balances across events by performer id', async () => {
    fake.tips = [
      { id: 'event-a', event_id: 'a', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 6000, performer_share_yen: 5000, refunded_amount_yen: 0 },
      { id: 'event-b', event_id: 'b', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 6001, performer_share_yen: 5001, refunded_amount_yen: 0 },
    ]
    const res = await requestPerformerPayout(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(res.status).toBe(200)
    expect(fake.createTransfer.mock.calls[0][0]).toMatchObject({ amount: 10_001 })
  })

  it('keeps test payments visible but excludes them from production payout balance', async () => {
    fake.tips = [{
      id: 'test', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 20_000,
      performer_share_yen: 17_000, refunded_amount_yen: 0, stripe_session_id: 'cs_test_fixture',
    }]
    const view = await getPerformerPayoutView(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(view).toMatchObject({ productionGrossYen: 0, testGrossYen: 20_000, hakuAvailableYen: 0, canPayout: false })
  })

  it('never pays a connected-account direct charge again from the platform', async () => {
    fake.tips = [{
      id: 'direct', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 20_000,
      performer_share_yen: 17_000, refunded_amount_yen: 0, stripe_checkout_mode: 'direct',
      connected_account_id: 'acct_1',
    }]
    const view = await getPerformerPayoutView(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(view).toMatchObject({
      productionGrossYen: 20_000, performerShareYen: 17_000, hakuAvailableYen: 0,
      heldYen: 0, adjustmentYen: 0, canPayout: false,
    })
  })

  it('excludes expired and unconfirmed sessions from production gross', async () => {
    fake.tips = [
      { id: 'expired', status: 'expired', settlement_status: null, gross_amount_yen: 50_000, performer_share_yen: 40_000 },
      { id: 'pending', status: 'pending', settlement_status: null, gross_amount_yen: 30_000, performer_share_yen: 0 },
      { id: 'paid', status: 'succeeded', settlement_status: 'settled', gross_amount_yen: 500, performer_share_yen: 408 },
    ]
    const view = await getPerformerPayoutView(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(view.productionGrossYen).toBe(500)
  })

  it('removes a fully refunded payment from the payout balance', async () => {
    fake.tips = [{
      id: 'refund', status: 'refunded', settlement_status: 'settled', gross_amount_yen: 12_000,
      stripe_fee_yen: 400, haku_fee_bps: 1500, performer_share_yen: 9_860, refunded_amount_yen: 12_000,
    }]
    const view = await getPerformerPayoutView(sb as never, stripe as never, { performerId: 'p1', stripeAccountId: 'acct_1' })
    expect(view).toMatchObject({ performerShareYen: 0, hakuAvailableYen: 0, availableYen: 0, adjustmentYen: 9_860, canPayout: false })
  })
})
