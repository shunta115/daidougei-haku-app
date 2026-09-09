import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null
}

export async function finalizePaidMerchOrder(
  sb: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; already: boolean; orderId: string | null; amount: number }> {
  const orderId = session.metadata?.order_id ?? null
  const amount = session.amount_total ?? 0
  if (!orderId) return { ok: false, already: false, orderId: null, amount }

  const { data: claimed } = await sb
    .from('merch_orders')
    .update({
      status: 'succeeded',
      stripe_session_id: session.id,
      stripe_payment_intent: paymentIntentId(session),
      checkout_customer_email: session.customer_details?.email ?? null,
      checkout_customer_name: session.customer_details?.name ?? null,
      checkout_customer_phone: session.customer_details?.phone ?? null,
    })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (!claimed?.id) {
    return { ok: true, already: true, orderId, amount }
  }

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
