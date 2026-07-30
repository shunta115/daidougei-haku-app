import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, getStripe } from './_shared.js'
import { publishLiveTipEvent } from './_tipEvents.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const sessionId =
      (typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined) ||
      (typeof req.query.session_id === 'string' ? req.query.session_id : undefined)

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
    const performerId = session.metadata?.performer_id
    const fanId = session.metadata?.fan_id ?? null
    const anonymous = session.metadata?.anonymous === '1'
    const amount = session.amount_total ?? 0
    if (!tipId) {
      res.status(400).json({ error: 'tip metadata missing' })
      return
    }

    const sb = getAdminSupabase()
    const { data: current } = await sb.from('tips').select('status').eq('id', tipId).maybeSingle()
    const already = current?.status === 'succeeded'

    await sb
      .from('tips')
      .update({
        status: 'succeeded',
        stripe_session_id: session.id,
        stripe_payment_intent:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null,
      })
      .eq('id', tipId)

    if (performerId && !already) {
      await sb.from('notifications').insert({
        user_id: performerId,
        title: 'New tip',
        body: `You received a tip of ¥${amount.toLocaleString('ja-JP')}.`,
      })

      const { data: open } = await sb
        .from('live_sessions')
        .select('id, tip_count, tip_amount_total')
        .eq('performer_id', performerId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (open?.id) {
        await sb
          .from('live_sessions')
          .update({
            tip_count: (open.tip_count ?? 0) + 1,
            tip_amount_total: (open.tip_amount_total ?? 0) + amount,
          })
          .eq('id', open.id)
      }

      await publishLiveTipEvent(sb, {
        tipId,
        performerId,
        fanId,
        amountYen: amount,
        isAnonymous: anonymous,
      })
    }

    res.status(200).json({ ok: true, tipId, amount, already })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Confirm failed' })
  }
}
