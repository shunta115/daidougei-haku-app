import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, getAppUrl, getStripe, isConnectedAccountTransferReady, requireAuthUser } from './_shared.js'
import { getPerformerPayoutView, requestPerformerPayout } from './_payouts.js'

type StripeErrorLike = {
  message?: unknown
  requestId?: unknown
  statusCode?: unknown
  raw?: { message?: unknown; statusCode?: unknown }
}

function isLiveKeyReadingTestAccount(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as StripeErrorLike
  const message = String(candidate.raw?.message ?? candidate.message ?? '').toLowerCase()
  const status = Number(candidate.statusCode ?? candidate.raw?.statusCode ?? 0)
  return status === 400
    && (
      (message.includes('similar object exists in test mode') && message.includes('live mode key'))
      || (message.includes('was a test account created with a testmode key') && message.includes('only be used with testmode keys'))
    )
}

function safeStripeFailureReason(error: unknown) {
  if (!error || typeof error !== 'object') return 'unavailable'
  const candidate = error as StripeErrorLike
  const message = String(candidate.raw?.message ?? candidate.message ?? '')
  if (!message) return 'unavailable'
  return message
    .replace(/sk_(?:live|test)_[A-Za-z0-9_]+/g, 'sk_[redacted]')
    .replace(/acct_[A-Za-z0-9]+/g, 'acct_[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]')
    .slice(0, 240)
}

function accountCreateParams(performerId: string, legacyTestAccountId?: string) {
  return {
    controller: {
      fees: { payer: 'account' as const },
      losses: { payments: 'stripe' as const },
      requirement_collection: 'stripe' as const,
      stripe_dashboard: { type: 'full' as const },
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      performer_id: performerId,
      ...(legacyTestAccountId ? { legacy_test_account_id: legacyTestAccountId } : {}),
    },
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let stripeStep: 'not_started' | 'account_create' | 'account_retrieve' | 'account_recover' | 'account_link' = 'not_started'
  try {
    const user = await requireAuthUser(req, res)
    if (!user) return

    const { performerId, action } = (req.body ?? {}) as { performerId?: string; action?: string }
    if (action && !['status', 'earnings', 'payout'].includes(action)) {
      res.status(400).json({ error: 'Unknown action' })
      return
    }
    if (!performerId) {
      res.status(400).json({ error: 'performerId required' })
      return
    }
    if (performerId !== user.id) {
      res.status(403).json({ error: 'Only the performer can start Stripe Connect' })
      return
    }

    const sb = getAdminSupabase()
    const { data: profile, error: profileError } = await sb.from('profiles').select('role,status').eq('id', user.id).single()
    if (profileError) throw profileError
    if (!profile || !['performer', 'admin'].includes(profile.role) || !['pending', 'active'].includes(profile.status)) {
      res.status(403).json({ error: '受取設定を利用できません。アカウントの登録状況を確認してください。' })
      return
    }
    const { data: performer, error } = await sb.from('performers').select('*').eq('id', performerId).single()
    if (error || !performer) {
      res.status(404).json({ error: 'Performer not found' })
      return
    }

    let accountId = performer.stripe_account_id as string | null
    res.setHeader('Cache-Control', 'no-store')
    if (action === 'earnings' || action === 'payout') {
      const stripe = getStripe()
      if (action === 'earnings') {
        res.status(200).json(await getPerformerPayoutView(sb, stripe, { performerId, stripeAccountId: accountId }))
        return
      }
      if (!accountId) {
        res.status(400).json({ error: '受取設定が完了していません。' })
        return
      }
      if (!performer.is_approved || profile.status !== 'active') {
        res.status(403).json({ error: '運営承認後に出金できます。' })
        return
      }
      const account = await stripe.accounts.retrieve(accountId)
      if (!isConnectedAccountTransferReady(account)) {
        res.status(409).json({ error: '受取設定に確認が必要です。Stripeの登録状況を確認してください。' })
        return
      }
      const result = await requestPerformerPayout(sb, stripe, { performerId, stripeAccountId: accountId })
      res.status(result.status).json(result.body)
      return
    }
    if (action === 'status' && !accountId) {
      res.status(200).json({ connected: false, complete: false, chargesEnabled: false, payoutsEnabled: false, transfersEnabled: false, detailsSubmitted: false, needsInformation: false, underReview: false, restricted: false, state: 'not_started' })
      return
    }
    const stripe = getStripe()
    if (!accountId) {
      stripeStep = 'account_create'
      const account = await stripe.accounts.create(accountCreateParams(performerId), { idempotencyKey: `performer-connect:${performerId}` })
      accountId = account.id
      const { error: saveError } = await sb.from('performers').update({ stripe_account_id: accountId }).eq('id', performerId)
      if (saveError) throw saveError
    } else {
      stripeStep = 'account_retrieve'
      let account
      try {
        account = await stripe.accounts.retrieve(accountId)
      } catch (retrieveError) {
        if (!isLiveKeyReadingTestAccount(retrieveError)) throw retrieveError
        console.warn('stripe_connect_account_mode_mismatch', { step: stripeStep, status: 400 })

        // A status refresh must remain read-only. Recovery only runs after the performer
        // explicitly presses the onboarding button (the request without an action).
        if (action === 'status') {
          res.status(200).json({ connected: false, complete: false, chargesEnabled: false, payoutsEnabled: false, transfersEnabled: false, detailsSubmitted: false, needsInformation: false, underReview: false, restricted: false, state: 'not_started' })
          return
        }

        stripeStep = 'account_recover'
        const exactMatches = []
        for await (const candidate of stripe.accounts.list({ limit: 100 })) {
          if (candidate.metadata?.performer_id === performerId) exactMatches.push(candidate)
          if (exactMatches.length > 1) break
        }
        if (exactMatches.length > 1) {
          throw new Error('Multiple live Connect accounts match the performer')
        }
        const previousAccountId = accountId
        account = exactMatches[0] ?? await stripe.accounts.create(
          accountCreateParams(performerId, previousAccountId),
          { idempotencyKey: `performer-connect:live:${performerId}` },
        )
        if (exactMatches[0] && exactMatches[0].metadata?.legacy_test_account_id !== previousAccountId) {
          account = await stripe.accounts.update(account.id, { metadata: { legacy_test_account_id: previousAccountId } })
        }
        accountId = account.id
        const { error: saveError } = await sb
          .from('performers')
          .update({ stripe_account_id: accountId, stripe_onboarding_complete: false })
          .eq('id', performerId)
          .eq('stripe_account_id', previousAccountId)
        if (saveError) throw saveError
      }
      const complete = isConnectedAccountTransferReady(account)
      const needsInformation = Boolean(account.requirements?.currently_due?.length || account.requirements?.past_due?.length)
      const underReview = Boolean(account.requirements?.pending_verification?.length)
      const restricted = Boolean(account.requirements?.disabled_reason)
      const transfersEnabled = account.capabilities?.transfers === 'active'
      const state = restricted ? 'restricted' : complete ? 'ready' : needsInformation ? 'needs_information' : underReview ? 'under_review' : 'in_progress'
      const { error: saveError } = await sb
        .from('performers')
        .update({ stripe_onboarding_complete: complete })
        .eq('id', performerId)
      if (saveError) throw saveError
      if (action === 'status') {
        res.status(200).json({
          connected: true, complete,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          transfersEnabled,
          detailsSubmitted: account.details_submitted,
          needsInformation,
          underReview,
          restricted,
          state,
        })
        return
      }
    }

    const origin = getAppUrl(req)
    stripeStep = 'account_link'
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/live?stripe=refresh`,
      return_url: `${origin}/live?stripe=return`,
      type: 'account_onboarding',
    })

    res.status(200).json({ url: link.url })
  } catch (error) {
    // Do not log Stripe request payloads, identity documents, account details or credentials.
    const raw = error && typeof error === 'object' && 'raw' in error && error.raw && typeof error.raw === 'object'
      ? error.raw as Record<string, unknown>
      : null
    const stripeCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : typeof raw?.code === 'string' ? raw.code : undefined
    const stripeType = error && typeof error === 'object' && 'type' in error && typeof error.type === 'string' ? error.type : undefined
    const statusCode = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : typeof raw?.statusCode === 'number' ? raw.statusCode : undefined
    const requestId = error && typeof error === 'object' && 'requestId' in error && typeof error.requestId === 'string' && /^req_[A-Za-z0-9]+$/.test(error.requestId)
      ? error.requestId
      : 'unknown'
    const category = stripeType?.startsWith('Stripe') || stripeCode ? 'stripe' : 'internal'
    console.error('stripe_connect_failed', { category, step: stripeStep, type: stripeType ?? 'unknown', code: stripeCode ?? 'unknown', status: statusCode ?? 'unknown', requestId, reason: category === 'stripe' ? safeStripeFailureReason(error) : 'internal' })
    res.status(500).json({ error: '受取設定を開始できませんでした。しばらくしてから再度お試しください。', code: category === 'stripe' ? 'stripe_connect_error' : 'connect_server_error' })
  }
}
