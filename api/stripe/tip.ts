import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  MIN_TIP_AMOUNT_YEN,
  PLATFORM_FEE_BPS,
  calcPlatformFee,
  getAdminSupabase,
  getAppUrl,
  getIntSetting,
  getOptionalAuthUser,
  getStripe,
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
    const user = await getOptionalAuthUser(req)

    const { performerId, fanId, amountYen, returnTo, anonymous, requestId } = req.body as {
      performerId?: string
      fanId?: string
      amountYen?: number
      returnTo?: string
      anonymous?: boolean
      requestId?: string
    }

    if (fanId && fanId !== user?.id) {
      res.status(403).json({ code: 'invalid_payment_request' })
      return
    }

    const payerId = user?.id ?? null
    const checkoutId = typeof requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
      ? requestId
      : crypto.randomUUID()
    const sb = getAdminSupabase()
    if (payerId) {
      const { data: payerAccount } = await sb.from('profiles').select('status').eq('id', payerId).maybeSingle()
      if (payerAccount && (payerAccount.status === 'suspended' || payerAccount.status === 'deleted')) {
        res.status(403).json({ code: 'invalid_payment_request' })
        return
      }
    }
    const minTipAmount = await getIntSetting(sb, 'tip_min_amount_yen', MIN_TIP_AMOUNT_YEN, 100, 100000)
    if (!performerId || !Number.isInteger(amountYen) || amountYen < minTipAmount || amountYen > 100000) {
      res.status(400).json({ code: 'invalid_payment_request' })
      return
    }

    const { data: performer, error } = await sb.from('performers').select('*').eq('id', performerId).single()
    if (error || !performer) {
      res.status(404).json({ code: 'performer_support_unavailable' })
      return
    }
    const { data: performerAccount } = await sb.from('profiles').select('status').eq('id', performerId).maybeSingle()
    if (!performer.is_approved || performerAccount?.status !== 'active') {
      res.status(403).json({ code: 'performer_support_unavailable' })
      return
    }
    if (!performer.stripe_account_id) {
      res.status(400).json({ code: 'performer_support_unavailable' })
      return
    }

    const stripe = getStripe()
    const account = await requireConnectedAccountChargeReady(stripe, performer.stripe_account_id)
    if (!account) {
      await sb.from('performers').update({ stripe_onboarding_complete: false }).eq('id', performerId)
      res.status(400).json({ code: 'performer_support_unavailable' })
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

    // Financial policy is server-authoritative. Never accept a client or mutable DB rate.
    const feeBps = PLATFORM_FEE_BPS
    const fee = calcPlatformFee(amountYen, feeBps)
    let { data: tip, error: tipErr } = await sb
      .from('tips')
      .insert({
        id: checkoutId,
        fan_id: payerId,
        performer_id: performerId,
        amount_cents: amountYen,
        currency: 'jpy',
        platform_fee_cents: fee,
        status: 'pending',
      })
      .select('id')
      .single()
    if (tipErr && tipErr.code === '23505') {
      const { data: existing, error: existingError } = await sb
        .from('tips')
        .select('id,fan_id,performer_id,amount_cents,status,stripe_session_id,connected_account_id')
        .eq('id', checkoutId)
        .maybeSingle()
      if (existingError) throw existingError
      if (!existing || (existing.fan_id ?? null) !== payerId || existing.performer_id !== performerId || Number(existing.amount_cents) !== amountYen) {
        res.status(409).json({ code: 'invalid_payment_request' })
        return
      }
      if (existing.stripe_session_id) {
        const existingSession = await stripe.checkout.sessions.retrieve(existing.stripe_session_id, {}, { stripeAccount: performer.stripe_account_id })
        if (existingSession.url && existing.status === 'pending') {
          res.status(200).json({ url: existingSession.url })
          return
        }
        res.status(409).json({ code: 'invalid_payment_request' })
        return
      }
      tip = { id: existing.id }
      tipErr = null
    }
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
      fan_id: payerId ?? 'guest',
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
    console.error('tip checkout failed', e)
    res.status(500).json({ code: 'checkout_failed' })
  }
}
