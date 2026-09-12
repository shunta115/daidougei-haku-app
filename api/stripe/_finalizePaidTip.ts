import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { publishLiveTipEvent } from './_tipEvents.js'

function stripeId(value: string | { id?: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id ?? null
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return stripeId(session.payment_intent)
}

function latestChargeId(paymentIntent: Stripe.PaymentIntent): string | null {
  return stripeId(paymentIntent.latest_charge)
}

function chargeId(charge: Stripe.Charge): string {
  return charge.id
}

function applicationFeeId(charge: Stripe.Charge): string | null {
  return stripeId(charge.application_fee)
}

function missingColumn(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message)
}

async function updateTipWithFallback(
  sb: SupabaseClient,
  tipId: string,
  patch: Record<string, unknown>,
  oldPatch: Record<string, unknown>,
  statusFilter: string[],
) {
  const { data, error } = await sb
    .from('tips')
    .update(patch)
    .eq('id', tipId)
    .in('status', statusFilter)
    .select('id')
    .maybeSingle()

  if (!error) return data as { id: string } | null
  if (!missingColumn(error)) throw error

  const { data: fallback, error: fallbackError } = await sb
    .from('tips')
    .update(oldPatch)
    .eq('id', tipId)
    .in('status', statusFilter)
    .select('id')
    .maybeSingle()
  if (fallbackError) throw fallbackError
  return fallback as { id: string } | null
}

async function claimPaidTip(
  sb: SupabaseClient,
  args: {
    tipId: string
    performerId?: string
    fanId: string | null
    anonymous: boolean
    amount: number
    stripeSessionId?: string | null
    stripePaymentIntentId?: string | null
    stripeChargeId?: string | null
    stripeApplicationFeeId?: string | null
    connectedAccountId?: string | null
  },
): Promise<{ ok: boolean; already: boolean; tipId: string | null; amount: number }> {
  const oldPatch = {
    status: 'succeeded',
    ...(args.stripeSessionId ? { stripe_session_id: args.stripeSessionId } : {}),
    stripe_payment_intent: args.stripePaymentIntentId,
  }
  const patch = {
    ...oldPatch,
    stripe_payment_intent_id: args.stripePaymentIntentId,
    stripe_charge_id: args.stripeChargeId,
    stripe_application_fee_id: args.stripeApplicationFeeId,
    connected_account_id: args.connectedAccountId,
    gross_amount_yen: args.amount,
    paid_at: new Date().toISOString(),
  }

  const claimed = await updateTipWithFallback(sb, args.tipId, patch, oldPatch, ['pending', 'failed'])

  if (!claimed?.id) {
    return { ok: true, already: true, tipId: args.tipId, amount: args.amount }
  }

  if (args.performerId) {
    await sb.from('notifications').insert({
      user_id: args.performerId,
      title: 'New tip',
      body: `You received a tip of ¥${args.amount.toLocaleString('ja-JP')}.`,
    })

    const { data: open } = await sb
      .from('live_sessions')
      .select('id, tip_count, tip_amount_total')
      .eq('performer_id', args.performerId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (open?.id) {
      await sb
        .from('live_sessions')
        .update({
          tip_count: (open.tip_count ?? 0) + 1,
          tip_amount_total: (open.tip_amount_total ?? 0) + args.amount,
        })
        .eq('id', open.id)
    }

    await publishLiveTipEvent(sb, {
      tipId: args.tipId,
      performerId: args.performerId,
      fanId: args.fanId,
      amountYen: args.amount,
      isAnonymous: args.anonymous,
    })
  }

  return { ok: true, already: false, tipId: args.tipId, amount: args.amount }
}

/**
 * Claim a pending tip exactly once, then apply revenue side effects.
 * Safe for concurrent webhook + confirm.
 */
export async function finalizePaidTip(
  sb: SupabaseClient,
  session: Stripe.Checkout.Session,
  connectedAccountId?: string | null,
): Promise<{ ok: boolean; already: boolean; tipId: string | null; amount: number }> {
  const tipId = session.metadata?.tip_id ?? null
  const performerId = session.metadata?.performer_id
  const fanId = session.metadata?.fan_id ?? null
  const anonymous = session.metadata?.anonymous === '1'
  const amount = session.amount_total ?? 0

  if (!tipId) return { ok: false, already: false, tipId: null, amount }

  return claimPaidTip(sb, {
    tipId,
    performerId,
    fanId,
    anonymous,
    amount,
    stripeSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session),
    connectedAccountId: connectedAccountId ?? session.metadata?.connected_account_id ?? null,
  })
}

export async function finalizePaidTipFromPaymentIntent(
  sb: SupabaseClient,
  paymentIntent: Stripe.PaymentIntent,
  connectedAccountId?: string | null,
): Promise<{ ok: boolean; already: boolean; tipId: string | null; amount: number }> {
  const tipId = paymentIntent.metadata?.tip_id ?? null
  const performerId = paymentIntent.metadata?.performer_id
  const fanId = paymentIntent.metadata?.fan_id ?? null
  const anonymous = paymentIntent.metadata?.anonymous === '1'
  const amount = paymentIntent.amount_received || paymentIntent.amount || 0
  if (!tipId) return { ok: false, already: false, tipId: null, amount }

  return claimPaidTip(sb, {
    tipId,
    performerId,
    fanId,
    anonymous,
    amount,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: latestChargeId(paymentIntent),
    connectedAccountId: connectedAccountId ?? paymentIntent.metadata?.connected_account_id ?? null,
  })
}

export async function markTipPaymentFailed(sb: SupabaseClient, paymentIntent: Stripe.PaymentIntent) {
  const tipId = paymentIntent.metadata?.tip_id
  if (!tipId) return
  const oldPatch = {
    status: 'failed',
    stripe_payment_intent: paymentIntent.id,
  }
  const patch = {
    ...oldPatch,
    stripe_payment_intent_id: paymentIntent.id,
    failure_code: paymentIntent.last_payment_error?.code ?? null,
    failure_message: paymentIntent.last_payment_error?.message ?? null,
  }
  await updateTipWithFallback(sb, tipId, patch, oldPatch, ['pending'])
}

export async function markTipCheckoutExpired(sb: SupabaseClient, session: Stripe.Checkout.Session) {
  const tipId = session.metadata?.tip_id
  if (!tipId) return
  await updateTipWithFallback(
    sb,
    tipId,
    { status: 'failed', stripe_session_id: session.id },
    { status: 'failed', stripe_session_id: session.id },
    ['pending'],
  )
}

export async function markTipRefunded(sb: SupabaseClient, charge: Stripe.Charge, connectedAccountId?: string | null) {
  const paymentIntentId = stripeId(charge.payment_intent)
  const refundedAmount = charge.amount_refunded ?? 0
  if (!paymentIntentId && !charge.id) return

  const patch = {
    status: 'refunded',
    stripe_charge_id: chargeId(charge),
    stripe_application_fee_id: applicationFeeId(charge),
    connected_account_id: connectedAccountId ?? null,
    refunded_amount_yen: refundedAmount,
  }
  const oldPatch = { status: 'refunded' }
  const byCharge = await sb
    .from('tips')
    .update(patch)
    .eq('stripe_charge_id', charge.id)
    .select('id')
    .maybeSingle()
  if (byCharge.error && !missingColumn(byCharge.error)) throw byCharge.error
  if (byCharge.data?.id) return

  const update = sb.from('tips').update(patch)
  const legacyUpdate = sb.from('tips').update(oldPatch)
  if (paymentIntentId) {
    const { error } = await update.or(`stripe_payment_intent_id.eq.${paymentIntentId},stripe_payment_intent.eq.${paymentIntentId}`)
    if (error && missingColumn(error)) await legacyUpdate.eq('stripe_payment_intent', paymentIntentId)
    else if (error) throw error
  }
}

export async function markTipDispute(
  sb: SupabaseClient,
  dispute: Stripe.Dispute,
  connectedAccountId?: string | null,
) {
  const charge = stripeId(dispute.charge)
  if (!charge) return
  const status = dispute.status ?? 'unknown'
  const closed = ['won', 'lost', 'warning_closed'].includes(status)
  const patch = {
    stripe_charge_id: charge,
    connected_account_id: connectedAccountId ?? null,
    dispute_status: status,
    disputed_at: new Date((dispute.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    dispute_closed_at: closed ? new Date().toISOString() : null,
  }
  const { error } = await sb.from('tips').update(patch).eq('stripe_charge_id', charge)
  if (error && !missingColumn(error)) throw error
}
