import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  MIN_TIP_AMOUNT_YEN,
  PLATFORM_FEE_BPS,
  getAdminSupabase,
  getAppUrl,
  getIntSetting,
  getOptionalAuthUser,
  getStripe,
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
    const stripe = getStripe()

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
    let { data: tip, error: tipErr } = await sb
      .from('tips')
      .insert({
        id: checkoutId,
        fan_id: payerId,
        performer_id: performerId,
        amount_cents: amountYen,
        currency: 'jpy',
        platform_fee_cents: 0,
        status: 'pending',
      })
      .select('id')
      .single()
    if (tipErr && tipErr.code === '23505') {
      const { data: existing, error: existingError } = await sb
        .from('tips')
        .select('id,fan_id,performer_id,amount_cents,status,stripe_session_id,connected_account_id,stripe_checkout_mode')
        .eq('id', checkoutId)
        .maybeSingle()
      if (existingError) throw existingError
      if (!existing || (existing.fan_id ?? null) !== payerId || existing.performer_id !== performerId || Number(existing.amount_cents) !== amountYen) {
        res.status(409).json({ code: 'invalid_payment_request' })
        return
      }
      if (existing.stripe_session_id) {
        const existingSession = existing.stripe_checkout_mode === 'platform_separate'
          ? await stripe.checkout.sessions.retrieve(existing.stripe_session_id)
          : performer.stripe_account_id
            ? await stripe.checkout.sessions.retrieve(existing.stripe_session_id, {}, { stripeAccount: performer.stripe_account_id })
            : await stripe.checkout.sessions.retrieve(existing.stripe_session_id)
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

    const connectedAccountId = (performer.stripe_account_id as string | null) ?? null
    const tipMetaPatch = {
      gross_amount_yen: amountYen,
      platform_fee_yen: 0,
      connected_account_id: connectedAccountId,
      stripe_checkout_mode: 'platform_separate',
      funding_model: 'platform_separate',
      transfer_status: 'pending_onboarding',
    }
    const { error: tipMetaErr } = await sb.from('tips').update(tipMetaPatch).eq('id', tip.id)
    if (tipMetaErr && !missingColumn(tipMetaErr)) throw tipMetaErr

    const paymentIntentMetadata = {
      kind: 'tip',
      tip_id: tip.id,
      performer_id: performerId,
      fan_id: payerId ?? 'guest',
      anonymous: anonymous ? '1' : '0',
      charge_type: 'platform_separate',
      funding_model: 'platform_separate',
      platform_fee_bps: String(feeBps),
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
                name: `${performer.stage_name}への応援`,
                description: 'HAKU 投げ銭',
              },
            },
          },
        ],
        payment_intent_data: { metadata: paymentIntentMetadata },
        branding_settings: { display_name: 'HAKU' },
        locale: 'ja',
        custom_text: {
          submit: { message: 'HAKUを通じてパフォーマーの活動を応援します。' },
        },
        metadata: {
          ...paymentIntentMetadata,
        },
      },
      { idempotencyKey: `tip-checkout-${tip.id}` },
    )

    await sb.from('tips').update({ stripe_session_id: session.id }).eq('id', tip.id)
    res.status(200).json({ url: session.url })
  } catch (e) {
    console.error('tip checkout failed', e)
    res.status(500).json({ code: 'checkout_failed' })
  }
}
