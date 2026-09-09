import type { VercelRequest, VercelResponse } from '@vercel/node'
import { finalizePaidMerchOrder } from './_finalizeMerchOrder.js'
import { getAdminSupabase, getStripe, requireAuthUser } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const user = await requireAuthUser(req, res)
    if (!user) return

    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' })
      return
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') {
      res.status(200).json({ ok: false, status: session.payment_status })
      return
    }

    const orderId = session.metadata?.order_id
    const buyerId = session.metadata?.buyer_id ?? null
    if (!orderId || session.metadata?.kind !== 'merch') {
      res.status(400).json({ error: 'order metadata missing' })
      return
    }
    if (buyerId !== user.id) {
      res.status(403).json({ error: 'This checkout session does not belong to you' })
      return
    }

    const sb = getAdminSupabase()
    const { data: current } = await sb
      .from('merch_orders')
      .select('buyer_id, stripe_session_id')
      .eq('id', orderId)
      .maybeSingle()
    if (!current || current.buyer_id !== user.id) {
      res.status(403).json({ error: 'This order does not belong to you' })
      return
    }
    if (current.stripe_session_id && current.stripe_session_id !== session.id) {
      res.status(403).json({ error: 'Checkout session mismatch' })
      return
    }

    const result = await finalizePaidMerchOrder(sb, session)
    res.status(200).json({ ok: result.ok, orderId: result.orderId, amount: result.amount, already: result.already })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Confirm failed' })
  }
}
