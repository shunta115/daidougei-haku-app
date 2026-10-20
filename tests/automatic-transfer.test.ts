import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processPerformerTransfers, syncAutomaticTransferForSale } from '../api/stripe/_distribution'

const readyAccount = {
  details_submitted: true,
  payouts_enabled: true,
  capabilities: { transfers: 'active' },
  requirements: { disabled_reason: null, currently_due: [], past_due: [], pending_verification: [] },
}

function fixture() {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = []
  const transfer = vi.fn(async (params: Record<string, unknown>) => ({
    id: 'tr_1', amount: params.amount, amount_reversed: 0, destination: params.destination,
    reversed: false, metadata: params.metadata,
  }))
  const payable = {
    id: 'payable-1', sale_id: 'sale-1', performer_id: 'performer-1', connected_account_id: 'acct_1',
    stripe_charge_id: 'ch_1', amount_yen: 409, state: 'processing', hold_reason: null,
    stripe_transfer_id: null, transferred_yen: 0, reversed_yen: 0,
    idempotency_key: 'haku-sale-transfer:tip:sale-1', attempt_count: 1,
  }
  const sb = {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => table === 'performers'
            ? { data: { id: value, stripe_account_id: 'acct_1' }, error: null }
            : { data: null, error: null },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          eq: async () => { updates.push({ table, patch }); return { error: null } },
          then: (resolve: (value: unknown) => void) => resolve((updates.push({ table, patch }), { error: null })),
        }),
      }),
    }),
    rpc: vi.fn(() => Promise.resolve({ data: [payable], error: null })),
  }
  const stripe = {
    accounts: { retrieve: vi.fn(async () => readyAccount) },
    transfers: { create: transfer, retrieve: vi.fn(), createReversal: vi.fn() },
  }
  return { sb, stripe, payable, transfer, updates }
}

describe('automatic sale-scoped Connect Transfers', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'
    delete process.env.ENABLE_LIVE_PERFORMER_TRANSFERS
  })

  it('transfers a sub-10,000 JPY share once with source_transaction and a stable key', async () => {
    const f = fixture()
    const result = await processPerformerTransfers(f.sb as never, f.stripe as never, {
      performerId: 'performer-1', connectedAccountId: 'acct_1',
    })
    expect(result).toEqual({ transferred: 1, held: false })
    expect(f.transfer).toHaveBeenCalledWith(expect.objectContaining({
      amount: 409, destination: 'acct_1', source_transaction: 'ch_1',
    }), { idempotencyKey: 'haku-sale-transfer:tip:sale-1' })
    expect(f.updates.at(-1)?.patch).toMatchObject({ state: 'transferred', stripe_transfer_id: 'tr_1' })
  })

  it('retains an unknown timeout as retryable and never marks it transferred', async () => {
    const f = fixture()
    f.transfer.mockRejectedValueOnce(new Error('network timeout after write'))
    const result = await processPerformerTransfers(f.sb as never, f.stripe as never, {
      performerId: 'performer-1', connectedAccountId: 'acct_1',
    })
    expect(result.transferred).toBe(0)
    expect(f.updates.at(-1)?.patch).toMatchObject({ state: 'retry' })
    expect(f.updates.at(-1)?.patch.last_error_message).not.toContain('sk_test_fixture')
  })

  it('rejects a performer/account mismatch before claiming or calling Stripe Transfer', async () => {
    const f = fixture()
    const result = await processPerformerTransfers(f.sb as never, f.stripe as never, {
      performerId: 'performer-1', connectedAccountId: 'acct_other',
    })
    expect(result).toMatchObject({ transferred: 0, held: true, reason: 'connected_account_mismatch' })
    expect(f.transfer).not.toHaveBeenCalled()
    expect(f.sb.rpc).not.toHaveBeenCalled()
  })

  it('never imports a historical/AWP sale without the explicit eligibility timestamp', async () => {
    const f = fixture()
    const saleSb = {
      ...f.sb,
      from: (table: string) => table === 'tips' ? {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: {
            id: 'awp-sale', performer_id: 'performer-1', stripe_charge_id: 'ch_old',
            stripe_balance_transaction_id: 'txn_old', performer_share_yen: 1000,
            settlement_status: 'settled', stripe_checkout_mode: 'platform_separate',
            automatic_transfer_eligible_at: null, status: 'succeeded', dispute_status: null,
            refunded_amount_yen: 0,
          }, error: null,
        }) }) }),
      } : f.sb.from(table),
    }
    const result = await syncAutomaticTransferForSale(saleSb as never, f.stripe as never, { kind: 'tip', saleId: 'awp-sale' })
    expect(result).toEqual({ synced: false, reason: 'historical_excluded' })
    expect(f.sb.rpc).not.toHaveBeenCalled()
    expect(f.transfer).not.toHaveBeenCalled()
  })

  it('reverses only the overpaid difference after a post-Transfer partial refund', async () => {
    const f = fixture()
    const createReversal = vi.fn(async () => ({ id: 'trr_1', amount: 109 }))
    f.stripe.transfers.retrieve.mockResolvedValue({ id: 'tr_1', amount: 409, amount_reversed: 0 })
    f.stripe.transfers.createReversal = createReversal
    const payable = {
      ...f.payable, state: 'reversal_pending', amount_yen: 300,
      transferred_yen: 409, stripe_transfer_id: 'tr_1', hold_reason: 'refund_adjustment',
    }
    const saleSb = {
      ...f.sb,
      from: (table: string) => table === 'tips' ? {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: {
            id: 'sale-1', performer_id: 'performer-1', stripe_charge_id: 'ch_1',
            stripe_balance_transaction_id: 'txn_1', performer_share_yen: 300,
            settlement_status: 'settled', stripe_checkout_mode: 'platform_separate',
            automatic_transfer_eligible_at: '2026-10-20T00:00:00Z', status: 'succeeded',
            dispute_status: null, refunded_amount_yen: 100,
          }, error: null,
        }) }) }),
      } : f.sb.from(table),
      rpc: vi.fn(() => ({ maybeSingle: async () => ({ data: payable, error: null }) })),
    }
    const result = await syncAutomaticTransferForSale(saleSb as never, f.stripe as never, { kind: 'tip', saleId: 'sale-1' })
    expect(result).toEqual({ synced: true, state: 'reversal_pending' })
    expect(createReversal).toHaveBeenCalledWith('tr_1', expect.objectContaining({ amount: 109 }), {
      idempotencyKey: 'haku-sale-transfer:tip:sale-1:reverse:109',
    })
    expect(f.updates.at(-1)?.patch).toMatchObject({ state: 'partially_reversed', reversed_yen: 109 })
  })
})

