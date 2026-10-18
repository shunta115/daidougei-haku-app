import { describe, expect, it } from 'vitest'
import { finalizePaidMerchOrder } from '../api/stripe/_finalizeMerchOrder'
import { settleCharge } from '../api/stripe/_settlement'

type Row = Record<string, unknown>

function orderStore(initial: Row) {
  let row = { ...initial }
  return {
    get row() { return row },
    client: {
      from() {
        return {
          select() {
            const filters: Array<[string, unknown]> = []
            return {
              eq(column: string, value: unknown) { filters.push([column, value]); return this },
              async maybeSingle() {
                return { data: filters.every(([key, value]) => row[key] === value) ? { ...row } : null, error: null }
              },
            }
          },
          update(patch: Row) {
            const filters: Array<[string, unknown]> = []
            let allowed: string[] | null = null
            return {
              eq(column: string, value: unknown) { filters.push([column, value]); return this },
              in(_column: string, values: string[]) { allowed = values; return this },
              select() { return this },
              async maybeSingle() {
                const match = filters.every(([key, value]) => row[key] === value) && (!allowed || allowed.includes(String(row.status)))
                if (!match) return { data: null, error: null }
                row = { ...row, ...patch }
                return { data: { id: row.id }, error: null }
              },
            }
          },
        }
      },
    },
  }
}

describe('merch cashless payment flow', () => {
  it('confirms a paid Checkout once and only then makes it ready for handoff', async () => {
    const store = orderStore({
      id: 'order-1', seller_id: 'seller-1', buyer_id: 'buyer-1', product_id: 'product-1',
      amount_yen: 1000, gross_amount_yen: 1000, stripe_session_id: 'cs_test_1', status: 'pending',
      fulfillment_status: 'awaiting_payment',
    })
    const session = {
      id: 'cs_test_1', amount_total: 1000, payment_intent: 'pi_test_1',
      metadata: { order_id: 'order-1', seller_id: 'seller-1', buyer_id: 'buyer-1', product_id: 'product-1' },
      customer_details: { email: 'buyer@example.test', name: '購入者', phone: null },
    }

    const first = await finalizePaidMerchOrder(store.client as never, session as never, 'acct_test_1')
    expect(first).toMatchObject({ ok: true, already: false, orderId: 'order-1' })
    expect(store.row).toMatchObject({ status: 'succeeded', fulfillment_status: 'awaiting_pickup', stripe_payment_intent_id: 'pi_test_1' })

    const duplicate = await finalizePaidMerchOrder(store.client as never, session as never, 'acct_test_1')
    expect(duplicate).toMatchObject({ ok: true, already: true })
  })

  it('uses the actual Stripe fee before calculating the 8% HAKU fee', async () => {
    let saved: Row | null = null
    const sb = {
      from: () => ({
        update: (patch: Row) => ({
          eq: async () => { saved = patch; return { error: null } },
        }),
      }),
    }
    const stripe = {
      charges: { retrieve: async () => ({ id: 'ch_test_1', amount: 1000, amount_refunded: 0, balance_transaction: 'txn_test_1', application_fee: null }) },
      balanceTransactions: { retrieve: async () => ({ id: 'txn_test_1', fee: 36 }) },
    }

    await settleCharge(sb as never, stripe as never, {
      kind: 'merch', rowId: 'order-1', chargeId: 'ch_test_1', connectedAccountId: 'acct_test_1',
      chargeType: 'platform_separate', feeBps: 800, collectedAppFeeYen: 0,
    })

    expect(saved).toMatchObject({
      stripe_fee_yen: 36,
      net_after_stripe_yen: 964,
      haku_fee_bps: 800,
      haku_fee_yen: 77,
      performer_share_yen: 887,
      settlement_status: 'settled',
    })
  })
})
