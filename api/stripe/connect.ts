import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, getAppUrl, getStripe, isConnectedAccountTransferReady, requireAuthUser } from './_shared.js'
import { getPerformerPayoutView, requestPerformerPayout } from './_payouts.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let stripeStep: 'not_started' | 'account_create' | 'account_retrieve' | 'account_link' = 'not_started'
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
      const account = await stripe.accounts.create({
        controller: {
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'full' },
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { performer_id: performerId },
      }, { idempotencyKey: `performer-connect:${performerId}` })
      accountId = account.id
      const { error: saveError } = await sb.from('performers').update({ stripe_account_id: accountId }).eq('id', performerId)
      if (saveError) throw saveError
    } else {
      stripeStep = 'account_retrieve'
      const account = await stripe.accounts.retrieve(accountId)
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
    const category = stripeType?.startsWith('Stripe') || stripeCode ? 'stripe' : 'internal'
    console.error('stripe_connect_failed', { category, step: stripeStep, code: stripeCode ?? 'unknown', status: statusCode ?? 'unknown' })
    res.status(500).json({ error: '受取設定を開始できませんでした。しばらくしてから再度お試しください。', code: category === 'stripe' ? 'stripe_connect_error' : 'connect_server_error' })
  }
}
