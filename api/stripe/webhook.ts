import type { VercelRequest, VercelResponse } from '@vercel/node'
import type Stripe from 'stripe'
import { finalizePaidTip } from './_finalizePaidTip.js'
import { expireMerchOrderReservation, finalizePaidMerchOrder } from './_finalizeMerchOrder.js'
import { getAdminSupabase, getStripe } from './_shared.js'

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
      if (session.payment_status === 'paid') {
        if (session.metadata?.kind === 'merch') {
          await finalizePaidMerchOrder(sb, session)
        } else {
          await finalizePaidTip(sb, session)
        }
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.metadata?.kind === 'merch') {
        await expireMerchOrderReservation(sb, session)
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
