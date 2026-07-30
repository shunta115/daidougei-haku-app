import type { VercelRequest, VercelResponse } from '@vercel/node'
import { calcPlatformFee, getAdminSupabase, getAppUrl, getStripe } from './_shared.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { performerId, fanId, amountYen, returnTo, anonymous } = req.body as {
      performerId?: string
      fanId?: string
      amountYen?: number
      returnTo?: string
      anonymous?: boolean
    }

    if (!performerId || !fanId || !amountYen || amountYen < 100) {
      res.status(400).json({ error: 'performerId, fanId, and amountYen (>=100) required' })
      return
    }

    const sb = getAdminSupabase()
    const { data: performer, error } = await sb.from('performers').select('*').eq('id', performerId).single()
    if (error || !performer) {
      res.status(404).json({ error: 'Performer not found' })
      return
    }
    if (!performer.stripe_account_id) {
      res.status(400).json({ error: 'Performer has not finished Stripe onboarding yet' })
      return
    }

    const stripe = getStripe()
    if (!performer.stripe_onboarding_complete) {
      const acct = await stripe.accounts.retrieve(performer.stripe_account_id)
      const active = Boolean(acct.charges_enabled && acct.details_submitted)
      if (!active) {
        res.status(400).json({ error: 'Performer has not finished Stripe onboarding yet' })
        return
      }
      await sb.from('performers').update({ stripe_onboarding_complete: true }).eq('id', performerId)
    }

    const fee = calcPlatformFee(amountYen)
    const { data: tip, error: tipErr } = await sb
      .from('tips')
      .insert({
        fan_id: fanId,
        performer_id: performerId,
        amount_cents: amountYen,
        currency: 'jpy',
        platform_fee_cents: fee,
        status: 'pending',
      })
      .select('id')
      .single()
    if (tipErr || !tip) throw tipErr || new Error('Tip insert failed')

    const origin = getAppUrl(req)
    const safeReturn = returnTo === 'live'
    const successUrl = safeReturn
      ? `${origin}/?tip=success&session_id={CHECKOUT_SESSION_ID}&return=live&performerId=${encodeURIComponent(performerId)}`
      : `${origin}/?tip=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = safeReturn
      ? `${origin}/?tip=cancel&return=live&performerId=${encodeURIComponent(performerId)}`
      : `${origin}/?tip=cancel`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'jpy',
            unit_amount: amountYen,
            product_data: {
              name: `Tip for ${performer.stage_name}`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: {
          destination: performer.stripe_account_id,
        },
        metadata: {
          tip_id: tip.id,
          performer_id: performerId,
          fan_id: fanId,
          anonymous: anonymous ? '1' : '0',
        },
      },
      metadata: {
        tip_id: tip.id,
        performer_id: performerId,
        fan_id: fanId,
        anonymous: anonymous ? '1' : '0',
      },
    })

    await sb.from('tips').update({ stripe_session_id: session.id }).eq('id', tip.id)
    res.status(200).json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Tip checkout failed' })
  }
}
