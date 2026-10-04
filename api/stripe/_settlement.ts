import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import {
  MERCH_SYSTEM_FEE_BPS,
  TIP_SYSTEM_FEE_BPS,
  applicationFeeRefundDueYen,
  settleSale,
  settleSaleAfterRefund,
} from '../../shared/fees.js'
import { refundSaleStatus } from '../../shared/payoutMath.js'

function missingColumn(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message)
}

function missingTable(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return /relation .* does not exist|Could not find the table|schema cache/i.test(message)
}

function stripeId(value: string | { id?: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id ?? null
}

function yenFromStripe(value: number | null | undefined): number {
  return Number.isInteger(value) && (value ?? 0) >= 0 ? Number(value) : 0
}

async function loadBalanceTransaction(
  stripe: Stripe,
  charge: Stripe.Charge,
  connectedAccountId: string | null,
) {
  const btId = stripeId(charge.balance_transaction)
  if (!btId) return null
  if (typeof charge.balance_transaction === 'object' && charge.balance_transaction && 'fee' in charge.balance_transaction) {
    return charge.balance_transaction
  }
  return stripe.balanceTransactions.retrieve(btId, connectedAccountId ? { stripeAccount: connectedAccountId } : undefined)
}

async function reconcileApplicationFee(
  stripe: Stripe,
  args: {
    applicationFeeId: string
    chargeId: string
    grossYen: number
    stripeFeeYen: number
    refundedYen: number
    feeBps: number
    collectedAppFeeYen: number
  },
) {
  const applicationFee = await stripe.applicationFees.retrieve(args.applicationFeeId)
  const collectedYen = yenFromStripe(applicationFee.amount) || args.collectedAppFeeYen
  // Reapply the formal equation to the remaining gross: N=max(0,(G-R)-S).
  const remainingHakuFeeYen = settleSaleAfterRefund(
    args.grossYen,
    args.stripeFeeYen,
    args.refundedYen,
    args.feeBps,
  ).hakuFeeYen
  const alreadyRefundedYen = yenFromStripe(applicationFee.amount_refunded)
  const refundNowYen = applicationFeeRefundDueYen(collectedYen, alreadyRefundedYen, remainingHakuFeeYen)
  if (refundNowYen <= 0) return
  await stripe.applicationFees.createRefund(
    args.applicationFeeId,
    { amount: refundNowYen },
    { idempotencyKey: `haku-app-fee-adj:${args.chargeId}:${args.refundedYen}` },
  )
}

export async function settleCharge(
  sb: SupabaseClient,
  stripe: Stripe,
  args: {
    kind: 'tip' | 'merch'
    rowId: string
    chargeId: string | null
    connectedAccountId: string | null
    chargeType: 'direct' | 'platform_separate'
    feeBps: number
    collectedAppFeeYen: number
  },
) {
  if (!args.chargeId || !args.connectedAccountId) return
  const stripeAccount = args.chargeType === 'direct' ? args.connectedAccountId : null
  const charge = await stripe.charges.retrieve(args.chargeId, stripeAccount ? { stripeAccount } : undefined)
  const bt = await loadBalanceTransaction(stripe, charge, stripeAccount)
  const grossYen = yenFromStripe(charge.amount)
  const stripeFeeYen = yenFromStripe(bt?.fee)
  const settled = settleSale(grossYen, stripeFeeYen, args.feeBps)
  const refundedYen = yenFromStripe(charge.amount_refunded)
  const status = refundSaleStatus(grossYen, refundedYen)
  const table = args.kind === 'tip' ? 'tips' : 'merch_orders'
  const patch = {
    stripe_charge_id: charge.id,
    stripe_application_fee_id: stripeId(charge.application_fee),
    stripe_balance_transaction_id: stripeId(charge.balance_transaction),
    stripe_fee_yen: settled.stripeFeeYen,
    net_after_stripe_yen: settled.netYen,
    haku_fee_bps: args.feeBps,
    haku_fee_yen: settled.hakuFeeYen,
    platform_fee_yen: settled.hakuFeeYen,
    performer_share_yen: settled.performerShareYen,
    refunded_amount_yen: refundedYen,
    settlement_status: 'settled',
    ...(status === 'succeeded' ? {} : { status }),
  }
  const { error } = await sb.from(table).update(patch).eq('id', args.rowId)
  if (error && !missingColumn(error)) throw error

  const applicationFeeId = stripeId(charge.application_fee)
  if (args.chargeType === 'direct' && applicationFeeId) {
    try {
      await reconcileApplicationFee(stripe, {
        applicationFeeId,
        chargeId: charge.id,
        grossYen,
        stripeFeeYen,
        refundedYen,
        feeBps: args.feeBps,
        collectedAppFeeYen: args.collectedAppFeeYen,
      })
    } catch {
      const { error: markError } = await sb.from(table).update({ settlement_status: 'fee_adjust_failed' }).eq('id', args.rowId)
      if (markError && !missingColumn(markError)) throw markError
    }
  }
}

export async function settleSaleByCharge(
  sb: SupabaseClient,
  stripe: Stripe,
  charge: Stripe.Charge,
  connectedAccountId: string | null,
) {
  const paymentIntentId = stripeId(charge.payment_intent)
  const chargeId = charge.id
  if (!chargeId && !paymentIntentId) return

  const tipQuery = chargeId
    ? sb.from('tips').select('id, platform_fee_yen, platform_fee_cents, stripe_checkout_mode').eq('stripe_charge_id', chargeId).maybeSingle()
    : sb.from('tips').select('id, platform_fee_yen, platform_fee_cents, stripe_checkout_mode').or(`stripe_payment_intent_id.eq.${paymentIntentId},stripe_payment_intent.eq.${paymentIntentId}`).maybeSingle()
  const merchQuery = chargeId
    ? sb.from('merch_orders').select('id, platform_fee_yen, stripe_checkout_mode').eq('stripe_charge_id', chargeId).maybeSingle()
    : sb.from('merch_orders').select('id, platform_fee_yen, stripe_checkout_mode').or(`stripe_payment_intent_id.eq.${paymentIntentId},stripe_payment_intent.eq.${paymentIntentId}`).maybeSingle()

  const [tip, merch] = await Promise.all([tipQuery, merchQuery])
  if (tip.error && !missingColumn(tip.error)) throw tip.error
  if (merch.error && !missingColumn(merch.error)) throw merch.error

  if (tip.data?.id) {
    await settleCharge(sb, stripe, {
      kind: 'tip',
      rowId: tip.data.id,
      chargeId,
      connectedAccountId,
      chargeType: tip.data.stripe_checkout_mode === 'platform_separate' ? 'platform_separate' : 'direct',
      feeBps: TIP_SYSTEM_FEE_BPS,
      collectedAppFeeYen: yenFromStripe(tip.data.platform_fee_yen ?? tip.data.platform_fee_cents),
    })
  }
  if (merch.data?.id) {
    await settleCharge(sb, stripe, {
      kind: 'merch',
      rowId: merch.data.id,
      chargeId,
      connectedAccountId,
      chargeType: merch.data.stripe_checkout_mode === 'platform_separate' ? 'platform_separate' : 'direct',
      feeBps: MERCH_SYSTEM_FEE_BPS,
      collectedAppFeeYen: yenFromStripe(merch.data.platform_fee_yen),
    })
  }
}

/** Settlement fallback for the customer return path when webhook delivery is delayed. */
export async function settleCheckoutPayment(
  sb: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  connectedAccountId: string | null,
) {
  const paymentIntentId = stripeId(session.payment_intent)
  if (!paymentIntentId) return
  const platformCharge = session.metadata?.charge_type === 'platform_separate'
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, !platformCharge && connectedAccountId ? { stripeAccount: connectedAccountId } : undefined)
  const chargeId = stripeId(paymentIntent.latest_charge)
  if (!chargeId) return
  await settleSaleByCharge(
    sb,
    stripe,
    { id: chargeId, payment_intent: paymentIntentId } as Stripe.Charge,
    connectedAccountId,
  )
}

export { missingColumn, missingTable, stripeId, yenFromStripe }
