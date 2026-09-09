import type { VercelRequest, VercelResponse } from '@vercel/node'
import { calcPlatformFee, getAdminSupabase, getAppUrl, getStripe, requireAuthUser } from './_shared.js'

async function merchFeeBps(sb: ReturnType<typeof getAdminSupabase>) {
  try {
    const { data } = await sb.from('platform_settings').select('value').eq('key', 'merch_fee_bps').maybeSingle()
    const n = Number(data?.value)
    if (Number.isFinite(n) && n >= 0 && n <= 5000) return Math.floor(n)
  } catch {
    /* keep default */
  }
  return 1000
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const user = await requireAuthUser(req, res)
    if (!user) return

    const { productId, quantity } = req.body as { productId?: string; quantity?: number }
    const qty = Math.floor(Number(quantity) || 1)
    if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      res.status(400).json({ error: 'productId and quantity (1-20) required' })
      return
    }

    const sb = getAdminSupabase()
    const { data: product, error: productErr } = await sb
      .from('merch_products')
      .select('*')
      .eq('id', productId)
      .maybeSingle()
    if (productErr || !product) {
      res.status(404).json({ error: 'Product not found' })
      return
    }
    if (product.status !== 'active' || product.stock < qty) {
      res.status(409).json({ error: 'Product is not available' })
      return
    }

    const { data: buyer } = await sb
      .from('profiles')
      .select('display_name, email')
      .eq('id', user.id)
      .maybeSingle()
    const buyerDisplayName = String(buyer?.display_name || user.email?.split('@')[0] || 'User').trim().slice(0, 120)
    const buyerEmail = typeof buyer?.email === 'string' ? buyer.email : user.email ?? null

    const { data: seller, error: sellerErr } = await sb
      .from('performers')
      .select('id, stage_name, is_approved, stripe_account_id, stripe_onboarding_complete')
      .eq('id', product.seller_id)
      .maybeSingle()
    if (sellerErr || !seller) {
      res.status(404).json({ error: 'Seller not found' })
      return
    }
    if (!seller.is_approved) {
      res.status(403).json({ error: 'Seller is not approved yet' })
      return
    }
    if (!seller.stripe_account_id) {
      res.status(400).json({ error: 'Seller has not finished Stripe onboarding yet' })
      return
    }

    const stripe = getStripe()
    if (!seller.stripe_onboarding_complete) {
      const acct = await stripe.accounts.retrieve(seller.stripe_account_id)
      const active = Boolean(acct.charges_enabled && acct.details_submitted)
      if (!active) {
        res.status(400).json({ error: 'Seller has not finished Stripe onboarding yet' })
        return
      }
      await sb.from('performers').update({ stripe_onboarding_complete: true }).eq('id', seller.id)
    }

    const amount = product.price_yen * qty
    const fee = calcPlatformFee(amount, await merchFeeBps(sb))
    const { data: order, error: orderErr } = await sb
      .from('merch_orders')
      .insert({
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
        platform_fee_yen: fee,
        status: 'pending',
      })
      .select('id')
      .single()
    if (orderErr || !order) throw orderErr || new Error('Order insert failed')

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
      res.status(409).json({ error: 'Product stock changed. Please try again.' })
      return
    }

    try {
      const origin = getAppUrl(req)
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: buyerEmail ?? undefined,
          phone_number_collection: { enabled: true },
          success_url: `${origin}/live?merch=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/live?merch=cancel`,
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
          payment_intent_data: {
            application_fee_amount: fee,
            transfer_data: {
              destination: seller.stripe_account_id,
            },
            metadata: {
              kind: 'merch',
              order_id: order.id,
              product_id: product.id,
              seller_id: product.seller_id,
              buyer_id: user.id,
            },
          },
          metadata: {
            kind: 'merch',
            order_id: order.id,
            product_id: product.id,
            seller_id: product.seller_id,
            buyer_id: user.id,
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
    res.status(500).json({ error: e instanceof Error ? e.message : 'Merch checkout failed' })
  }
}
