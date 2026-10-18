import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  MERCH_SYSTEM_FEE_BPS_DEFAULT,
  getAdminSupabase,
  getAppUrl,
  getStripe,
  requireAuthUser,
} from './_shared.js'

function missingColumn(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message)
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const listOrders = req.method === 'GET' && req.query.action === 'orders'
  if (req.method !== 'POST' && !listOrders) {
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const user = await requireAuthUser(req, res)
    if (!user) return
    const sb = getAdminSupabase()

    if (listOrders || req.body?.action === 'reserve' || req.body?.action === 'order_action') {
      const { error: expiryError } = await sb.rpc('expire_due_merch_reservations')
      if (expiryError) throw expiryError
    }

    if (listOrders) {
      const scope = req.query.scope === 'seller' ? 'seller' : 'buyer'
      const column = scope === 'seller' ? 'seller_id' : 'buyer_id'
      const { data, error } = await sb
        .from('merch_orders')
        .select('*')
        .eq(column, user.id)
        .order('created_at', { ascending: false })
        .limit(scope === 'seller' ? 100 : 50)
      if (error) throw error
      res.status(200).json({ orders: data ?? [] })
      return
    }

    if (req.body?.action === 'reserve') {
      const { productId, quantity, requestId } = req.body as Record<string, unknown>
      const qty = Math.floor(Number(quantity) || 0)
      if (typeof productId !== 'string' || typeof requestId !== 'string' || !UUID_V4.test(requestId) || qty < 1 || qty > 20) {
        res.status(400).json({ code: 'invalid_reservation_request' })
        return
      }
      const { data, error } = await sb.rpc('create_merch_cash_reservation', {
        p_order_id: requestId,
        p_buyer_id: user.id,
        p_product_id: productId,
        p_quantity: qty,
      })
      if (error) {
        if (/product_unavailable|seller_unavailable/.test(error.message)) {
          res.status(409).json({ code: 'product_unavailable' })
          return
        }
        throw error
      }
      const reservation = Array.isArray(data) ? data[0] : data
      res.status(200).json({ orderId: reservation?.order_id, orderNumber: reservation?.order_number })
      return
    }

    if (req.body?.action === 'order_action') {
      const orderId = typeof req.body.orderId === 'string' ? req.body.orderId : ''
      const handoffAction = typeof req.body.handoffAction === 'string' ? req.body.handoffAction : ''
      if (!orderId || !['fulfill', 'cancel', 'expire'].includes(handoffAction)) {
        res.status(400).json({ code: 'invalid_order_action' })
        return
      }
      const { data, error } = await sb.rpc('update_merch_handoff', {
        p_order_id: orderId,
        p_actor_id: user.id,
        p_action: handoffAction,
      })
      if (error) {
        if (/not_authorized/.test(error.message)) {
          res.status(403).json({ code: 'not_authorized' })
          return
        }
        if (/payment_not_confirmed|not_ready_for_handoff/.test(error.message)) {
          res.status(409).json({ code: 'payment_not_confirmed' })
          return
        }
        throw error
      }
      const order = Array.isArray(data) ? data[0] : data
      res.status(200).json({ ok: true, fulfillmentStatus: order?.fulfillment_status })
      return
    }

    const { productId, quantity, requestId } = req.body as { productId?: string; quantity?: number; requestId?: string }
    const qty = Math.floor(Number(quantity) || 1)
    if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 20 || !requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      res.status(400).json({ code: 'invalid_payment_request' })
      return
    }

    const { data: product, error: productErr } = await sb
      .from('merch_products')
      .select('*')
      .eq('id', productId)
      .maybeSingle()
    if (productErr || !product) {
      res.status(404).json({ code: 'product_unavailable' })
      return
    }
    if (product.status !== 'active' || product.stock < qty) {
      res.status(409).json({ code: 'product_unavailable' })
      return
    }

    const { data: buyer } = await sb
      .from('profiles')
      .select('display_name, email, status')
      .eq('id', user.id)
      .maybeSingle()
    if (buyer?.status === 'suspended' || buyer?.status === 'deleted') {
      res.status(403).json({ code: 'invalid_payment_request' })
      return
    }
    const buyerDisplayName = String(buyer?.display_name || user.email?.split('@')[0] || 'User').trim().slice(0, 120)
    const buyerEmail = typeof buyer?.email === 'string' ? buyer.email : user.email ?? null

    const { data: seller, error: sellerErr } = await sb
      .from('performers')
      .select('id, stage_name, is_approved, stripe_account_id, stripe_onboarding_complete')
      .eq('id', product.seller_id)
      .maybeSingle()
    if (sellerErr || !seller) {
      res.status(404).json({ code: 'seller_checkout_unavailable' })
      return
    }
    if (!seller.is_approved) {
      res.status(403).json({ code: 'seller_checkout_unavailable' })
      return
    }
    const stripe = getStripe()

    const amount = product.price_yen * qty
    const orderNumber = `P-${requestId.replaceAll('-', '').slice(0, 12).toUpperCase()}`
    // Financial policy is server-authoritative. Never accept a client or mutable DB rate.
    const feeBps = MERCH_SYSTEM_FEE_BPS_DEFAULT
    const { data: order, error: orderErr } = await sb
      .from('merch_orders')
      .insert({
        id: requestId,
        buyer_id: user.id,
        seller_id: product.seller_id,
        product_id: product.id,
        buyer_display_name: buyerDisplayName,
        buyer_email: buyerEmail,
        product_name: product.name,
        product_image_url: product.image_url,
        unit_price_yen: product.price_yen,
        quantity: qty,
        amount_yen: amount,
        currency: 'jpy',
        platform_fee_yen: 0,
        status: 'pending',
        order_kind: 'cashless',
        order_number: orderNumber,
        fulfillment_status: 'awaiting_payment',
      })
      .select('id')
      .single()
    if (orderErr?.code === '23505') {
      const { data: existing, error: existingErr } = await sb
        .from('merch_orders')
        .select('id, buyer_id, seller_id, product_id, quantity, amount_yen, status, stripe_session_id, stripe_checkout_mode')
        .eq('id', requestId)
        .maybeSingle()
      if (existingErr || !existing) throw existingErr || new Error('Order retry lookup failed')
      const sameRequest =
        existing.buyer_id === user.id &&
        existing.seller_id === product.seller_id &&
        existing.product_id === product.id &&
        Number(existing.quantity) === qty &&
        Number(existing.amount_yen) === amount
      if (!sameRequest) {
        res.status(409).json({ code: 'invalid_payment_request' })
        return
      }
      if (existing.status === 'pending' && existing.stripe_session_id) {
        const session = existing.stripe_checkout_mode === 'platform_separate'
          ? await stripe.checkout.sessions.retrieve(existing.stripe_session_id)
          : await stripe.checkout.sessions.retrieve(existing.stripe_session_id, {}, { stripeAccount: seller.stripe_account_id })
        if (session.url) {
          res.status(200).json({ url: session.url })
          return
        }
      }
      res.status(409).json({ code: 'checkout_failed' })
      return
    }
    if (orderErr || !order) throw orderErr || new Error('Order insert failed')

    // HAKU collects the platform charge now and transfers the settled seller
    // share only after the performer finishes Connect onboarding.
    const connectedAccountId = (seller.stripe_account_id as string | null) ?? null
    const orderMetaPatch = {
      gross_amount_yen: amount,
      connected_account_id: connectedAccountId,
      stripe_checkout_mode: 'platform_separate',
      seller_responsibility: 'seller',
    }
    const { error: orderMetaErr } = await sb.from('merch_orders').update(orderMetaPatch).eq('id', order.id)
    if (orderMetaErr && !missingColumn(orderMetaErr)) throw orderMetaErr

    const remaining = product.stock - qty
    const { data: reserved, error: reserveErr } = await sb
      .from('merch_products')
      .update({ stock: remaining, status: remaining <= 0 ? 'sold_out' : product.status })
      .eq('id', product.id)
      .eq('stock', product.stock)
      .select('id')
      .maybeSingle()
    if (reserveErr || !reserved?.id) {
      await sb.from('merch_orders').update({ status: 'failed' }).eq('id', order.id)
      res.status(409).json({ code: 'product_unavailable' })
      return
    }

    try {
      const paymentIntentMetadata = {
        kind: 'merch',
        order_id: order.id,
        product_id: product.id,
        seller_id: product.seller_id,
        buyer_id: user.id,
        ...(connectedAccountId ? { connected_account_id: connectedAccountId } : {}),
        charge_type: 'platform_separate',
        platform_fee_bps: String(feeBps),
        seller_responsibility: 'seller',
      }
      const origin = getAppUrl(req)
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: buyerEmail ?? undefined,
          phone_number_collection: { enabled: true },
          success_url: `${origin}/live?merch=success&session_id={CHECKOUT_SESSION_ID}&productId=${encodeURIComponent(product.id)}&performerId=${encodeURIComponent(product.seller_id)}`,
          cancel_url: `${origin}/live?merch=cancel&productId=${encodeURIComponent(product.id)}&performerId=${encodeURIComponent(product.seller_id)}`,
          line_items: [
            {
              quantity: qty,
              price_data: {
                currency: 'jpy',
                unit_amount: product.price_yen,
                product_data: {
                  name: product.name,
                  images: product.image_url ? [product.image_url] : undefined,
                  metadata: {
                    product_id: product.id,
                    seller_id: product.seller_id,
                  },
                },
              },
            },
          ],
          payment_intent_data: { metadata: paymentIntentMetadata },
          branding_settings: { display_name: 'HAKU' },
          locale: 'ja',
          custom_text: {
            submit: { message: '会場受取の商品です。送料はかかりません。決済後、パフォーマーから直接お受け取りください。' },
          },
          metadata: {
            ...paymentIntentMetadata,
          },
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        },
        { idempotencyKey: `merch-checkout-${order.id}` },
      )

      if (!session.url) throw new Error('Checkout URL missing')
      await sb.from('merch_orders').update({ stripe_session_id: session.id }).eq('id', order.id)
      res.status(200).json({ url: session.url })
    } catch (e) {
      await sb.from('merch_orders').update({ status: 'failed' }).eq('id', order.id).eq('status', 'pending')
      const { data: current } = await sb.from('merch_products').select('stock, status').eq('id', product.id).maybeSingle()
      if (current) {
        const restored = Math.max(0, (current.stock ?? 0) + qty)
        await sb
          .from('merch_products')
          .update({ stock: restored, status: current.status === 'sold_out' && restored > 0 ? 'active' : current.status })
          .eq('id', product.id)
      }
      throw e
    }
  } catch (e) {
    console.error('merch checkout failed', e)
    res.status(500).json({ code: 'checkout_failed' })
  }
}
