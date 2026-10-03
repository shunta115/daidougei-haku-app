import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { MERCH_SYSTEM_FEE_BPS, TIP_SYSTEM_FEE_BPS, applicationFeeOverageYen, settleSale } from '../../shared/fees.js'
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

export async function settleDirectCharge(
  sb: SupabaseClient,
  stripe: Stripe,
  args: {
    kind: 'tip' | 'merch'
    rowId: string
    chargeId: string | null
    connectedAccountId: string | null
    feeBps: number
    collectedAppFeeYen: number
  },
) {
  if (!args.chargeId || !args.connectedAccountId) return
  const charge = await stripe.charges.retrieve(args.chargeId, { stripeAccount: args.connectedAccountId })
  const bt = await loadBalanceTransaction(stripe, charge, args.connectedAccountId)
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
    performer_share_yen: settled.performerShareYen,
    refunded_amount_yen: refundedYen,
    settlement_status: 'settled',
    ...(status === 'succeeded' ? {} : { status }),
  }
  const { error } = await sb.from(table).update(patch).eq('id', args.rowId)
  if (error && !missingColumn(error)) throw error

  const overage = applicationFeeOverageYen(args.collectedAppFeeYen, settled.hakuFeeYen)
  const applicationFeeId = stripeId(charge.application_fee)
  if (overage > 0 && applicationFeeId) {
    try {
      await stripe.applicationFees.createRefund(applicationFeeId, { amount: overage }, { idempotencyKey: `haku-app-fee-adj:${charge.id}` })
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
    ? sb.from('tips').select('id, platform_fee_yen, platform_fee_cents').eq('stripe_charge_id', chargeId).maybeSingle()
    : sb.from('tips').select('id, platform_fee_yen, platform_fee_cents').or(`stripe_payment_intent_id.eq.${paymentIntentId},stripe_payment_intent.eq.${paymentIntentId}`).maybeSingle()
  const merchQuery = chargeId
    ? sb.from('merch_orders').select('id, platform_fee_yen').eq('stripe_charge_id', chargeId).maybeSingle()
    : sb.from('merch_orders').select('id, platform_fee_yen').or(`stripe_payment_intent_id.eq.${paymentIntentId},stripe_payment_intent.eq.${paymentIntentId}`).maybeSingle()

  const [tip, merch] = await Promise.all([tipQuery, merchQuery])
  if (tip.error && !missingColumn(tip.error)) throw tip.error
  if (merch.error && !missingColumn(merch.error)) throw merch.error

  if (tip.data?.id) {
    await settleDirectCharge(sb, stripe, {
      kind: 'tip',
      rowId: tip.data.id,
      chargeId,
      connectedAccountId,
      feeBps: TIP_SYSTEM_FEE_BPS,
      collectedAppFeeYen: yenFromStripe(tip.data.platform_fee_yen ?? tip.data.platform_fee_cents),
    })
  }
  if (merch.data?.id) {
    await settleDirectCharge(sb, stripe, {
      kind: 'merch',
      rowId: merch.data.id,
      chargeId,
      connectedAccountId,
      feeBps: MERCH_SYSTEM_FEE_BPS,
      collectedAppFeeYen: yenFromStripe(merch.data.platform_fee_yen),
    })
  }
}

export { missingColumn, missingTable, stripeId, yenFromStripe }
