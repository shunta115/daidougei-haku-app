import type { VercelRequest, VercelResponse } from '@vercel/node'
import type Stripe from 'stripe'
import {
  finalizePaidTip,
  finalizePaidTipFromPaymentIntent,
  markTipCheckoutExpired,
  markTipDispute,
  markTipPaymentFailed,
  markTipRefunded,
} from './_finalizePaidTip.js'
import {
  expireMerchOrderReservation,
  failMerchOrderReservation,
  finalizePaidMerchOrder,
  finalizePaidMerchOrderFromPaymentIntent,
  markMerchOrderDispute,
  markMerchOrderRefunded,
} from './_finalizeMerchOrder.js'
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

function missingTable(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return /relation .* does not exist|Could not find the table|schema cache/i.test(message)
}

function duplicateKey(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  return code === '23505'
}

function eventObjectId(event: Stripe.Event) {
  const obj = event.data.object as { id?: string }
  return obj.id ?? null
}

function constructWebhookEvent(stripe: Stripe, raw: Buffer, sig: string) {
  const secrets = [
    { source: 'platform', value: process.env.STRIPE_WEBHOOK_SECRET },
    { source: 'connect', value: process.env.STRIPE_CONNECT_WEBHOOK_SECRET },
  ].filter((s): s is { source: 'platform' | 'connect'; value: string } => Boolean(s.value))

  if (secrets.length === 0) throw new Error('Stripe webhook secret missing')

  let lastError: unknown
  for (const secret of secrets) {
    try {
      return { event: stripe.webhooks.constructEvent(raw, sig, secret.value), source: secret.source }
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Webhook signature verification failed')
}

async function claimWebhookEvent(
  sb: ReturnType<typeof getAdminSupabase>,
  event: Stripe.Event,
  source: 'platform' | 'connect',
  connectedAccountId: string | null,
) {
  const row = {
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    connected_account_id: connectedAccountId,
    source,
    object_id: eventObjectId(event),
    status: 'processing',
  }
  const { data, error } = await sb.from('stripe_webhook_events').insert(row).select('event_id').maybeSingle()
  if (!error) return Boolean(data?.event_id)
  if (missingTable(error)) return true
  if (!duplicateKey(error)) throw error

  const { data: existing } = await sb
    .from('stripe_webhook_events')
    .select('status')
    .eq('event_id', event.id)
    .maybeSingle()
  if (existing?.status === 'failed') {
    await sb
      .from('stripe_webhook_events')
      .update({ status: 'processing', error: null })
      .eq('event_id', event.id)
    return true
  }
  return false
}

async function markWebhookEvent(
  sb: ReturnType<typeof getAdminSupabase>,
  eventId: string,
  status: 'processed' | 'failed',
  error?: unknown,
) {
  const { error: updateError } = await sb
    .from('stripe_webhook_events')
    .update({
      status,
      processed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message.slice(0, 500) : null,
    })
    .eq('event_id', eventId)
  if (updateError && !missingTable(updateError)) throw updateError
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
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

    const { event, source } = constructWebhookEvent(stripe, raw, sig)
    const sb = getAdminSupabase()
    const connectedAccountId = typeof event.account === 'string' ? event.account : null
    const shouldProcess = await claimWebhookEvent(sb, event, source, connectedAccountId)
    if (!shouldProcess) {
      res.status(200).json({ received: true, duplicate: true })
      return
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.payment_status === 'paid') {
          if (session.metadata?.kind === 'merch') {
            await finalizePaidMerchOrder(sb, session, connectedAccountId)
          } else {
            await finalizePaidTip(sb, session, connectedAccountId)
          }
        }
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.kind === 'merch') {
          await expireMerchOrderReservation(sb, session)
        } else {
          await markTipCheckoutExpired(sb, session)
        }
      }

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        if (paymentIntent.metadata?.kind === 'merch') {
          await finalizePaidMerchOrderFromPaymentIntent(sb, paymentIntent, connectedAccountId)
        } else if (paymentIntent.metadata?.kind === 'tip' || paymentIntent.metadata?.tip_id) {
          await finalizePaidTipFromPaymentIntent(sb, paymentIntent, connectedAccountId)
        }
      }

      if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        if (paymentIntent.metadata?.kind === 'merch') {
          await failMerchOrderReservation(sb, paymentIntent)
        } else if (paymentIntent.metadata?.kind === 'tip' || paymentIntent.metadata?.tip_id) {
          await markTipPaymentFailed(sb, paymentIntent)
        }
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge
        await markTipRefunded(sb, charge, connectedAccountId)
        await markMerchOrderRefunded(sb, charge, connectedAccountId)
      }

      if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
        const dispute = event.data.object as Stripe.Dispute
        await markTipDispute(sb, dispute, connectedAccountId)
        await markMerchOrderDispute(sb, dispute, connectedAccountId)
      }

      if (event.type === 'account.updated') {
        const account = event.data.object as Stripe.Account
        const ready = Boolean(
          account.charges_enabled &&
            account.payouts_enabled &&
            account.details_submitted &&
            !account.requirements?.disabled_reason,
        )
        await sb
          .from('performers')
          .update({ stripe_onboarding_complete: ready })
          .eq('stripe_account_id', account.id)
      }

      await markWebhookEvent(sb, event.id, 'processed')
    } catch (e) {
      await markWebhookEvent(sb, event.id, 'failed', e)
      throw e
    }

    res.status(200).json({ received: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Webhook error' })
  }
}
