import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { paymentErrorMessage } from '../src/platform/lib/paymentErrors'

const read = (path: string) => readFileSync(path, 'utf8')

describe('payment safety boundaries', () => {
  it('uses customer-safe localized checkout errors', () => {
    expect(paymentErrorMessage('performer_support_unavailable', 'ja')).toContain('準備中')
    expect(paymentErrorMessage('performer_support_unavailable', 'en')).not.toContain('Stripe')
    expect(paymentErrorMessage('performer_support_unavailable', 'zh-TW')).toContain('表演者')
    expect(read('api/stripe/tip.ts')).not.toContain("json({ error: 'Performer has not finished Stripe onboarding yet' })")
    expect(read('api/stripe/merch.ts')).not.toContain("json({ error: 'Seller has not finished Stripe onboarding yet' })")
  })

  it('keeps Stripe readiness server-authoritative at checkout', () => {
    const tipUi = read('src/platform/screens/TipScreen.tsx')
    const merchUi = read('src/platform/screens/MerchScreens.tsx')
    expect(tipUi).toContain("paymentErrorMessage('performer_support_unavailable', lang)")
    expect(tipUi).toContain('disabled={busy || amount < 100 || !supportReady}')
    expect(merchUi).toContain("paymentErrorMessage('seller_checkout_unavailable', lang)")
    expect(merchUi).toContain('disabled={busy || !available || !seller || !checkoutAllowed}')
    expect(merchUi).not.toContain('seller?.stripe_onboarding_complete')
    expect(read('api/stripe/merch.ts')).toContain('stripe.accounts.retrieve(seller.stripe_account_id)')
    expect(read('api/stripe/merch.ts')).toContain('isConnectedAccountTransferReady(account)')
  })

  it('uses customer-facing Japanese Checkout copy', () => {
    const tip = read('api/stripe/tip.ts')
    const merch = read('api/stripe/merch.ts')
    expect(tip).toContain('`${performer.stage_name}への応援`')
    expect(tip).toContain("description: 'HAKU 投げ銭'")
    expect(tip).toContain("branding_settings: { display_name: 'HAKU' }")
    expect(merch).toContain("branding_settings: { display_name: 'HAKU' }")
    expect(tip).not.toContain('Tip for ${performer.stage_name}')
  })

  it('uses stable client request ids for retry-safe tip and merch checkout', () => {
    const tipUi = read('src/platform/screens/TipScreen.tsx')
    const merchUi = read('src/platform/screens/MerchScreens.tsx')
    const tipApi = read('api/stripe/tip.ts')
    const merchApi = read('api/stripe/merch.ts')
    expect(tipUi).toContain('checkoutRequestId.current = crypto.randomUUID()')
    expect(merchUi).toContain('checkoutRequestId.current ||= crypto.randomUUID()')
    expect(tipApi).toContain('idempotencyKey: `tip-checkout-${tip.id}`')
    expect(merchApi).toContain('idempotencyKey: `merch-checkout-${order.id}`')
  })

  it('fails closed without the webhook idempotency ledger and claims failed retries atomically', () => {
    const webhook = read('api/stripe/webhook.ts')
    expect(webhook).toContain('Webhook idempotency ledger unavailable')
    expect(webhook).toMatch(/\.eq\('status', 'failed'\)[\s\S]*\.select\('event_id'\)/)
    expect(webhook).not.toMatch(/if \(missingTable\(error\)\) return true/)
  })

  it('settles a platform-held sale from the paid checkout webhook', () => {
    const webhook = read('api/stripe/webhook.ts')
    const settlement = read('api/stripe/_settlement.ts')
    expect(webhook).toContain("const saleConnectedAccountId = connectedAccountId ?? session.metadata?.connected_account_id ?? null")
    expect(webhook).toContain('await settleCheckoutPayment(sb, stripe, session, saleConnectedAccountId)')
    expect(settlement).toContain('stripe_charge_id.eq.${chargeId}')
    expect(settlement).toContain('stripe_payment_intent_id.eq.${paymentIntentId}')
    expect(settlement).toContain('.or(saleIdentity)')
  })

  it('keeps financial ledgers server-write-only and reconciles refund fees', () => {
    const migration = read('supabase/migrations/20261004_payment_ledger_write_lockdown.sql')
    const settlement = read('api/stripe/_settlement.ts')
    expect(migration).toContain('revoke insert, update, delete on table public.tips from anon, authenticated')
    expect(migration).toContain('drop policy if exists tips_insert_fan')
    expect(settlement).toContain('applicationFeeRefundDueYen')
    expect(settlement).toContain('applicationFees.retrieve')
    expect(settlement).toMatch(/haku-app-fee-adj:\$\{args\.chargeId\}:\$\{args\.refundedYen\}/)
    expect(settlement).toContain('settleSaleAfterRefund(grossYen, stripeFeeYen, refundedYen, args.feeBps)')
    expect(settlement).toContain("if (args.chargeType === 'direct' && !args.connectedAccountId) return")
    expect(read('api/stripe/webhook.ts')).toContain("event.type === 'charge.refund.updated'")
  })

  it('restores merch stock once after a full refund', () => {
    const merch = read('api/stripe/_finalizeMerchOrder.ts')
    expect(merch).toContain(".neq('status', status === 'refunded' ? 'refunded' : '__never__')")
    expect(merch).toContain("if (status !== 'refunded' || !claimed?.product_id) return")
    expect(merch).toContain(".update({ stock, status: product.status === 'sold_out' && stock > 0 ? 'active' : product.status })")
  })

  it('holds new sales on the platform and transfers only after payout eligibility', () => {
    const tip = read('api/stripe/tip.ts')
    const merch = read('api/stripe/merch.ts')
    const payout = read('api/stripe/_payouts.ts')
    expect(tip).toContain("charge_type: 'platform_separate'")
    expect(merch).toContain("charge_type: 'platform_separate'")
    expect(tip).not.toContain('stripeAccount: connectedAccountId')
    expect(merch).not.toContain('stripeAccount: connectedAccountId')
    expect(payout).toContain('stripe.transfers.create')
    expect(payout).not.toContain('stripe.payouts.create')
  })

  it('normalizes guest fan metadata and verifies paid Stripe metadata against stored rows', () => {
    const tips = read('api/stripe/_finalizePaidTip.ts')
    const merch = read('api/stripe/_finalizeMerchOrder.ts')
    expect(tips).toMatch(/fan_id !== 'guest'/)
    expect(tips).toContain('Tip checkout metadata mismatch')
    expect(merch).toContain('Merch checkout metadata mismatch')
  })

  it('shows Stripe readiness without returning connected account ids', () => {
    const admin = read('api/ops/_hakuAdmin.ts')
    const ui = read('src/haku-admin/HakuAdminApp.tsx')
    expect(admin).toContain('stripePerformers')
    expect(admin).toContain('isConnectedAccountTransferReady')
    expect(admin).not.toContain('isConnectedAccountChargeReady')
    expect(admin).toContain('tip_available: Boolean(performer.is_approved)')
    expect(ui).toContain('決済・Stripe')
    expect(ui).not.toContain('stripe_account_id')
  })
})
