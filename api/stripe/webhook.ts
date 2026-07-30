import type { VercelRequest, VercelResponse } from '@vercel/node'
import type Stripe from 'stripe'
import { getAdminSupabase, getStripe } from './_shared.js'
import { publishLiveTipEvent } from './_tipEvents.js'

export const config = {
  api: { bodyParser: false },
}

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET missing' })
    return
  }

  try {
    const stripe = getStripe()
    const raw = await readRawBody(req)
    const sig = req.headers['stripe-signature']
    if (!sig || typeof sig !== 'string') {
      res.status(400).json({ error: 'Missing signature' })
      return
    }

    const event = stripe.webhooks.constructEvent(raw, sig, secret)
    const sb = getAdminSupabase()

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const tipId = session.metadata?.tip_id
      if (tipId) {
        const { data: currentTip } = await sb.from('tips').select('status').eq('id', tipId).maybeSingle()
        const alreadySucceeded = currentTip?.status === 'succeeded'

        await sb
          .from('tips')
          .update({
            status: 'succeeded',
            stripe_payment_intent:
              typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
          })
          .eq('id', tipId)

        const performerId = session.metadata?.performer_id
        const fanId = session.metadata?.fan_id ?? null
        const anonymous = session.metadata?.anonymous === '1'
        const amount = session.amount_total ?? 0
        if (performerId && !alreadySucceeded) {
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
      }
    }

    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account
      if (account.charges_enabled && account.details_submitted) {
        await sb
          .from('performers')
          .update({ stripe_onboarding_complete: true })
          .eq('stripe_account_id', account.id)
      }
    }

    res.status(200).json({ received: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Webhook error' })
  }
}
