import type { VercelRequest, VercelResponse } from '@vercel/node'
import { finalizePaidMerchOrder } from './_finalizeMerchOrder.js'
import { getAdminSupabase, getStripe, requireAuthUser } from './_shared.js'

function missingColumn(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message)
}

async function findOrderCheckout(sb: ReturnType<typeof getAdminSupabase>, sessionId: string) {
  const withConnect = await sb
    .from('merch_orders')
    .select('id, buyer_id, seller_id, stripe_session_id, connected_account_id')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()
  if (!withConnect.error) return withConnect.data
  if (!missingColumn(withConnect.error)) throw withConnect.error

  const legacy = await sb
    .from('merch_orders')
    .select('id, buyer_id, seller_id, stripe_session_id')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()
  if (legacy.error) throw legacy.error
  return legacy.data ? { ...legacy.data, connected_account_id: null } : null
}

async function retrieveCheckoutSession(
  stripe: ReturnType<typeof getStripe>,
  sessionId: string,
  connectedAccountId: string | null,
) {
  if (connectedAccountId) {
    try {
      return await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: connectedAccountId })
    } catch {
      return await stripe.checkout.sessions.retrieve(sessionId)
    }
  }
  return stripe.checkout.sessions.retrieve(sessionId)
}

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

    const sb = getAdminSupabase()
    const current = await findOrderCheckout(sb, sessionId)
    if (!current || current.buyer_id !== user.id) {
      res.status(403).json({ error: 'This order does not belong to you' })
      return
    }
    if (current.stripe_session_id && current.stripe_session_id !== sessionId) {
      res.status(403).json({ error: 'Checkout session mismatch' })
      return
    }

    let connectedAccountId = current.connected_account_id as string | null
    if (!connectedAccountId) {
      const { data: seller } = await sb
        .from('performers')
        .select('stripe_account_id')
        .eq('id', current.seller_id)
        .maybeSingle()
      connectedAccountId = seller?.stripe_account_id ?? null
    }

    const stripe = getStripe()
    const session = await retrieveCheckoutSession(stripe, sessionId, connectedAccountId)
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

    const result = await finalizePaidMerchOrder(sb, session, connectedAccountId)
    res.status(200).json({ ok: result.ok, orderId: result.orderId, amount: result.amount, already: result.already })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Confirm failed' })
  }
}
