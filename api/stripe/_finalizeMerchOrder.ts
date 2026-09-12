import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

function stripeId(value: string | { id?: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id ?? null
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return stripeId(session.payment_intent)
}

function latestChargeId(paymentIntent: Stripe.PaymentIntent): string | null {
  return stripeId(paymentIntent.latest_charge)
}

function applicationFeeId(charge: Stripe.Charge): string | null {
  return stripeId(charge.application_fee)
}

function missingColumn(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message)
}

async function updateOrderWithFallback(
  sb: SupabaseClient,
  orderId: string,
  patch: Record<string, unknown>,
  oldPatch: Record<string, unknown>,
  statusFilter: string[],
) {
  const { data, error } = await sb
    .from('merch_orders')
    .update(patch)
    .eq('id', orderId)
    .in('status', statusFilter)
    .select('id')
    .maybeSingle()

  if (!error) return data as { id: string } | null
  if (!missingColumn(error)) throw error

  const { data: fallback, error: fallbackError } = await sb
    .from('merch_orders')
    .update(oldPatch)
    .eq('id', orderId)
    .in('status', statusFilter)
    .select('id')
    .maybeSingle()
  if (fallbackError) throw fallbackError
  return fallback as { id: string } | null
}

export async function finalizePaidMerchOrder(
  sb: SupabaseClient,
  session: Stripe.Checkout.Session,
  connectedAccountId?: string | null,
): Promise<{ ok: boolean; already: boolean; orderId: string | null; amount: number }> {
  const orderId = session.metadata?.order_id ?? null
  const amount = session.amount_total ?? 0
  if (!orderId) return { ok: false, already: false, orderId: null, amount }

  const oldPatch = {
    status: 'succeeded',
    stripe_session_id: session.id,
    stripe_payment_intent: paymentIntentId(session),
    checkout_customer_email: session.customer_details?.email ?? null,
    checkout_customer_name: session.customer_details?.name ?? null,
    checkout_customer_phone: session.customer_details?.phone ?? null,
  }
  const patch = {
    ...oldPatch,
    stripe_payment_intent_id: paymentIntentId(session),
    connected_account_id: connectedAccountId ?? session.metadata?.connected_account_id ?? null,
    gross_amount_yen: amount,
    paid_at: new Date().toISOString(),
  }
  const claimed = await updateOrderWithFallback(sb, orderId, patch, oldPatch, ['pending'])

  if (!claimed?.id) {
    return { ok: true, already: true, orderId, amount }
  }

  return { ok: true, already: false, orderId, amount }
}

export async function finalizePaidMerchOrderFromPaymentIntent(
  sb: SupabaseClient,
  paymentIntent: Stripe.PaymentIntent,
  connectedAccountId?: string | null,
): Promise<{ ok: boolean; already: boolean; orderId: string | null; amount: number }> {
  const orderId = paymentIntent.metadata?.order_id ?? null
  const amount = paymentIntent.amount_received || paymentIntent.amount || 0
  if (!orderId) return { ok: false, already: false, orderId: null, amount }
  const oldPatch = {
    status: 'succeeded',
    stripe_payment_intent: paymentIntent.id,
  }
  const patch = {
    ...oldPatch,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_charge_id: latestChargeId(paymentIntent),
    connected_account_id: connectedAccountId ?? paymentIntent.metadata?.connected_account_id ?? null,
    gross_amount_yen: amount,
    paid_at: new Date().toISOString(),
  }
  const claimed = await updateOrderWithFallback(sb, orderId, patch, oldPatch, ['pending'])
  if (!claimed?.id) return { ok: true, already: true, orderId, amount }
  return { ok: true, already: false, orderId, amount }
}

export async function expireMerchOrderReservation(
  sb: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; released: boolean; orderId: string | null }> {
  const orderId = session.metadata?.order_id ?? null
  if (!orderId) return { ok: false, released: false, orderId: null }

  const { data: order } = await sb
    .from('merch_orders')
    .update({ status: 'expired', stripe_session_id: session.id })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('id, product_id, quantity')
    .maybeSingle()

  if (!order?.id) return { ok: true, released: false, orderId }

  const { data: product } = await sb
    .from('merch_products')
    .select('stock, status')
    .eq('id', order.product_id)
    .maybeSingle()

  if (product) {
    const stock = Math.max(0, (product.stock ?? 0) + (order.quantity ?? 0))
    await sb
      .from('merch_products')
      .update({ stock, status: product.status === 'sold_out' && stock > 0 ? 'active' : product.status })
      .eq('id', order.product_id)
  }

  return { ok: true, released: true, orderId }
}

export async function failMerchOrderReservation(sb: SupabaseClient, paymentIntent: Stripe.PaymentIntent) {
  const orderId = paymentIntent.metadata?.order_id
  if (!orderId) return
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
  const order = await updateOrderWithFallback(sb, orderId, patch, oldPatch, ['pending'])
  if (!order?.id) return

  const { data: current } = await sb
    .from('merch_orders')
    .select('product_id, quantity')
    .eq('id', orderId)
    .maybeSingle()
  if (!current?.product_id) return

  const { data: product } = await sb
    .from('merch_products')
    .select('stock, status')
    .eq('id', current.product_id)
    .maybeSingle()
  if (!product) return

  const stock = Math.max(0, (product.stock ?? 0) + (current.quantity ?? 0))
  await sb
    .from('merch_products')
    .update({ stock, status: product.status === 'sold_out' && stock > 0 ? 'active' : product.status })
    .eq('id', current.product_id)
}

export async function markMerchOrderRefunded(sb: SupabaseClient, charge: Stripe.Charge, connectedAccountId?: string | null) {
  const paymentIntentId = stripeId(charge.payment_intent)
  const refundedAmount = charge.amount_refunded ?? 0
  const patch = {
    status: 'refunded',
    stripe_charge_id: charge.id,
    stripe_application_fee_id: applicationFeeId(charge),
    connected_account_id: connectedAccountId ?? null,
    refunded_amount_yen: refundedAmount,
  }
  const oldPatch = { status: 'refunded' }
  const byCharge = await sb
    .from('merch_orders')
    .update(patch)
    .eq('stripe_charge_id', charge.id)
    .select('id')
    .maybeSingle()
  if (byCharge.error && !missingColumn(byCharge.error)) throw byCharge.error
  if (byCharge.data?.id || !paymentIntentId) return

  const { error } = await sb
    .from('merch_orders')
    .update(patch)
    .or(`stripe_payment_intent_id.eq.${paymentIntentId},stripe_payment_intent.eq.${paymentIntentId}`)
  if (error && missingColumn(error)) await sb.from('merch_orders').update(oldPatch).eq('stripe_payment_intent', paymentIntentId)
  else if (error) throw error
}

export async function markMerchOrderDispute(
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
  const { error } = await sb.from('merch_orders').update(patch).eq('stripe_charge_id', charge)
  if (error && !missingColumn(error)) throw error
}
