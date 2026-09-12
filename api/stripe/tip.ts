import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  MIN_TIP_AMOUNT_YEN,
  PLATFORM_FEE_BPS,
  calcPlatformFee,
  getAdminSupabase,
  getAppUrl,
  getBpsSetting,
  getIntSetting,
  getStripe,
  requireAuthUser,
  requireConnectedAccountChargeReady,
} from './_shared.js'

function missingColumn(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const user = await requireAuthUser(req, res)
    if (!user) return

    const { performerId, fanId, amountYen, returnTo, anonymous } = req.body as {
      performerId?: string
      fanId?: string
      amountYen?: number
      returnTo?: string
      anonymous?: boolean
    }

    if (fanId && fanId !== user.id) {
      res.status(403).json({ error: 'fanId must match the signed-in user' })
      return
    }

    const payerId = user.id
    const sb = getAdminSupabase()
    const minTipAmount = await getIntSetting(sb, 'tip_min_amount_yen', MIN_TIP_AMOUNT_YEN, 100, 100000)
    if (!performerId || !Number.isInteger(amountYen) || amountYen < minTipAmount || amountYen > 100000) {
      res.status(400).json({ error: `performerId and amountYen (${minTipAmount}-100000 JPY) required` })
      return
    }

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
    const account = await requireConnectedAccountChargeReady(stripe, performer.stripe_account_id)
    if (!account) {
      await sb.from('performers').update({ stripe_onboarding_complete: false }).eq('id', performerId)
      res.status(400).json({ error: 'Performer has not finished Stripe onboarding yet' })
      return
    }
    if (!performer.stripe_onboarding_complete) {
      await sb.from('performers').update({ stripe_onboarding_complete: true }).eq('id', performerId)
    }

    const origin = getAppUrl(req)
    const safeReturn = returnTo === 'live'
    const performerParam = `performerId=${encodeURIComponent(performerId)}`
    const successUrl = safeReturn
      ? `${origin}/live?tip=success&session_id={CHECKOUT_SESSION_ID}&return=live&${performerParam}`
      : `${origin}/live?tip=success&session_id={CHECKOUT_SESSION_ID}&${performerParam}`
    const cancelUrl = safeReturn
      ? `${origin}/live?tip=cancel&return=live&${performerParam}`
      : `${origin}/live?tip=cancel&${performerParam}`

    const feeBps = await getBpsSetting(sb, 'tip_fee_bps', PLATFORM_FEE_BPS)
    const fee = calcPlatformFee(amountYen, feeBps)
    const { data: tip, error: tipErr } = await sb
      .from('tips')
      .insert({
        fan_id: payerId,
        performer_id: performerId,
        amount_cents: amountYen,
        currency: 'jpy',
        platform_fee_cents: fee,
        status: 'pending',
      })
      .select('id')
      .single()
    if (tipErr || !tip) throw tipErr || new Error('Tip insert failed')

    const connectedAccountId = performer.stripe_account_id as string
    const tipMetaPatch = {
      gross_amount_yen: amountYen,
      platform_fee_yen: fee,
      connected_account_id: connectedAccountId,
      stripe_checkout_mode: 'direct',
    }
    const { error: tipMetaErr } = await sb.from('tips').update(tipMetaPatch).eq('id', tip.id)
    if (tipMetaErr && !missingColumn(tipMetaErr)) throw tipMetaErr

    const paymentIntentMetadata = {
      kind: 'tip',
      tip_id: tip.id,
      performer_id: performerId,
      fan_id: payerId,
      anonymous: anonymous ? '1' : '0',
      connected_account_id: connectedAccountId,
      charge_type: 'direct',
      platform_fee_bps: String(feeBps),
      platform_fee_yen: String(fee),
    }

    const session = await stripe.checkout.sessions.create(
      {
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
          ...(fee > 0 ? { application_fee_amount: fee } : {}),
          metadata: paymentIntentMetadata,
        },
        metadata: {
          ...paymentIntentMetadata,
        },
      },
      { idempotencyKey: `tip-checkout-${tip.id}`, stripeAccount: connectedAccountId },
    )

    await sb.from('tips').update({ stripe_session_id: session.id }).eq('id', tip.id)
    res.status(200).json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Tip checkout failed' })
  }
}
