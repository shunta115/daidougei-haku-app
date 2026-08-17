import type { VercelRequest, VercelResponse } from '@vercel/node'
import { finalizePaidTip } from './_finalizePaidTip.js'
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

    const tipId = session.metadata?.tip_id
    const fanId = session.metadata?.fan_id ?? null
    if (!tipId) {
      res.status(400).json({ error: 'tip metadata missing' })
      return
    }
    if (fanId !== user.id) {
      res.status(403).json({ error: 'This checkout session does not belong to you' })
      return
    }

    const sb = getAdminSupabase()
    const { data: current } = await sb
      .from('tips')
      .select('status, fan_id, stripe_session_id')
      .eq('id', tipId)
      .maybeSingle()
    if (!current || current.fan_id !== user.id) {
      res.status(403).json({ error: 'This tip does not belong to you' })
      return
    }
    if (current.stripe_session_id && current.stripe_session_id !== session.id) {
      res.status(403).json({ error: 'Checkout session mismatch' })
      return
    }

    const result = await finalizePaidTip(sb, session)
    res.status(200).json({ ok: result.ok, tipId: result.tipId, amount: result.amount, already: result.already })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Confirm failed' })
  }
}
