import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('event pickup merch safety', () => {
  const migration = read('supabase/migrations/20261008_merch_event_pickup.sql')
  const checkout = read('api/stripe/merch.ts')
  const finalize = read('api/stripe/_finalizeMerchOrder.ts')
  const ui = read('src/platform/screens/MerchScreens.tsx')

  it('accepts a standard UUID v4 idempotency key for cash reservations', () => {
    const reserve = read('api/stripe/merch.ts')
    expect(reserve).toContain('[89ab][0-9a-f]{3}-[0-9a-f]{12}')
  })

  it('reserves stock transactionally and restores it once on cancel or expiry', () => {
    expect(migration).toContain('for update;')
    expect(migration).toContain("order_kind = 'cash_reservation'")
    expect(migration).toContain("fulfillment_status = 'awaiting_pickup'")
    expect(migration).toContain('stock = stock - p_quantity')
    expect(migration).toContain('stock = stock + v_order.quantity')
    expect(migration).toContain('for update skip locked')
  })

  it('keeps reservation mutations server-only and order details private', () => {
    expect(migration).toContain('revoke all on function public.create_merch_cash_reservation')
    expect(migration).toContain('grant execute on function public.create_merch_cash_reservation')
    expect(read('supabase/migrations/20260909_merch_foundation.sql')).toContain('buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()')
    const ordersApi = read('api/stripe/merch.ts')
    expect(ordersApi).toContain("const column = scope === 'seller' ? 'seller_id' : 'buyer_id'")
    expect(ordersApi).toContain(".eq(column, user.id)")
  })

  it('cannot fulfill an unpaid cashless order', () => {
    expect(migration).toContain("v_order.order_kind = 'cashless' and v_order.status <> 'succeeded'")
    expect(migration).toContain("raise exception 'payment_not_confirmed'")
    expect(finalize).toContain("fulfillment_status: 'awaiting_pickup'")
  })

  it('issues distinct pickup numbers and charges no HAKU fee for cash reservations', () => {
    expect(checkout).toContain("const orderNumber = `P-")
    expect(migration).toContain("v_number := 'R-'")
    expect(migration).toContain("'jpy', 0, 'pending'")
    expect(migration).not.toContain('haku_fee_yen')
  })

  it('keeps cashless checkout recommended and shows pickup terms in plain Japanese', () => {
    expect(ui).toContain('おすすめ')
    expect(ui).toContain('先にキャッシュレスで支払う')
    expect(ui).toContain('無料で取り置く')
    expect(ui).toContain('送料')
    expect(ui).toContain('受取場所')
    expect(ui).toContain('受取期限')
  })

  it('retains platform-held Stripe checkout while cash reservation stays independent', () => {
    expect(checkout).toContain("stripe_checkout_mode: 'platform_separate'")
    expect(checkout).toContain("charge_type: 'platform_separate'")
    expect(ui).toContain('const checkoutAllowed = Boolean(seller?.is_approved)')
    expect(ui).toContain('const reservationReady = Boolean(seller?.is_approved')
  })
})
