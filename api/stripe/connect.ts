import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, getAppUrl, getStripe, isConnectedAccountTransferReady, requireAuthUser, stripeMode } from './_shared.js'
import { getPerformerPayoutView, requestPerformerPayout } from './_payouts.js'
import { previewReadiness } from './_previewReadiness.js'

type StripeErrorLike = {
  code?: unknown
  message?: unknown
  param?: unknown
  requestId?: unknown
  statusCode?: unknown
  raw?: { code?: unknown; message?: unknown; param?: unknown; statusCode?: unknown }
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

function isUnavailableConnectedAccount(error: unknown) {
  if (isLiveKeyReadingTestAccount(error)) return true
  if (!error || typeof error !== 'object') return false
  const candidate = error as StripeErrorLike
  const code = String(candidate.raw?.code ?? candidate.code ?? '')
  const param = String(candidate.raw?.param ?? candidate.param ?? '')
  const status = Number(candidate.statusCode ?? candidate.raw?.statusCode ?? 0)
  return code === 'resource_missing' && param === 'account' && (status === 400 || status === 404)
}

function disconnectedStatus(state: 'not_started' | 'account_mismatch') {
  return {
    connected: false,
    complete: false,
    chargesEnabled: false,
    payoutsEnabled: false,
    transfersEnabled: false,
    detailsSubmitted: false,
    needsInformation: false,
    underReview: false,
    restricted: false,
    currentlyDueCount: 0,
    pastDueCount: 0,
    pendingVerificationCount: 0,
    checkedAt: new Date().toISOString(),
    state,
  }
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

const LIVE_CONNECT_ACCOUNT_IDEMPOTENCY_VERSION = 'v2'

async function findLiveAccountsForPerformer(stripe: ReturnType<typeof getStripe>, performerId: string) {
  const exactMatches = []
  for await (const candidate of stripe.accounts.list({ limit: 100 })) {
    if (candidate.metadata?.performer_id === performerId) exactMatches.push(candidate)
    if (exactMatches.length > 1) break
  }
  return exactMatches
}

async function createOrReuseAccount(stripe: ReturnType<typeof getStripe>, performerId: string) {
  const exactMatches = await findLiveAccountsForPerformer(stripe, performerId)
  if (exactMatches.length > 1) throw new Error('Multiple live Connect accounts match the performer')
  if (exactMatches[0]) return { account: exactMatches[0], reused: true }

  // The version is changed only when a previous Stripe response is known to be
  // permanently cached under an older key. Every concurrent/retry request for
  // this performer still shares this one key and therefore converges on one
  // Stripe Account. A later request also searches Stripe metadata first, which
  // recovers safely when Stripe succeeded but the DB write or response failed.
  const account = await stripe.accounts.create(
    accountCreateParams(performerId),
    { idempotencyKey: `performer-connect:live:${LIVE_CONNECT_ACCOUNT_IDEMPOTENCY_VERSION}:${performerId}` },
  )
  return { account, reused: false }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET' && req.query.probe === 'preview-readiness') {
    if (process.env.VERCEL_ENV !== 'preview') {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const readiness = previewReadiness(stripeMode())
    res.status(readiness.safeForStripeOnboardingTest ? 200 : 503).json(readiness)
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let stripeStep: 'not_started' | 'status' | 'account_create' | 'account_save' | 'account_retrieve' | 'account_link_create' = 'not_started'
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

    // Account IDs and onboarding flags are privileged fields. The signed-in
    // user proves ownership above; a server-only, narrowly scoped RPC persists
    // Stripe state without weakening browser RLS policies.
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
    if (action === 'earnings' || action === 'payout') {
      const stripe = getStripe()
      const adminSb = getAdminSupabase()
      if (action === 'earnings') {
        res.status(200).json(await getPerformerPayoutView(adminSb, stripe, { performerId, stripeAccountId: accountId }))
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
      const result = await requestPerformerPayout(adminSb, stripe, { performerId, stripeAccountId: accountId })
      res.status(result.status).json(result.body)
      return
    }
    if (action === 'status' && !accountId) {
      res.status(200).json(disconnectedStatus('not_started'))
      return
    }
    const stripe = getStripe()
    if (!accountId) {
      stripeStep = 'account_create'
      const { account } = await createOrReuseAccount(stripe, performerId)
      accountId = account.id
      stripeStep = 'account_save'
      const { error: saveError } = await sb.rpc('sync_performer_stripe_connect', {
        p_performer_id: performerId,
        p_stripe_account_id: accountId,
      })
      if (saveError) throw saveError
    } else {
      stripeStep = action === 'status' ? 'status' : 'account_retrieve'
      let account
      try {
        account = await stripe.accounts.retrieve(accountId)
      } catch (retrieveError) {
        if (!isUnavailableConnectedAccount(retrieveError)) throw retrieveError
        console.warn('stripe_connect_account_unavailable', { step: stripeStep, status: 400 })

        // A status refresh never replaces the stored account id. It only clears a stale
        // completion flag; recovery runs after the performer explicitly starts onboarding.
        if (action === 'status') {
          const { error: syncError } = await sb.rpc('sync_performer_stripe_connect', {
            p_performer_id: performerId,
            p_onboarding_complete: false,
          })
          if (syncError) throw syncError
          res.status(200).json(disconnectedStatus('account_mismatch'))
          return
        }

        // Never replace a stored account automatically. It may still own historic
        // transfers or payouts in another Stripe mode/account. An operator must
        // reconcile that relationship before changing the durable mapping.
        res.status(409).json({
          error: '登録済みのStripeアカウントをこの環境で確認できません。既存の売上・送金履歴を保護するため、自動で新しいアカウントは作成しません。HAKU運営へお問い合わせください。',
          code: 'connect_account_mismatch',
        })
        return
      }
      const complete = isConnectedAccountTransferReady(account)
      const needsInformation = Boolean(account.requirements?.currently_due?.length || account.requirements?.past_due?.length)
      const underReview = Boolean(account.requirements?.pending_verification?.length)
      const restricted = Boolean(account.requirements?.disabled_reason)
      const transfersEnabled = account.capabilities?.transfers === 'active'
      const state = restricted ? 'restricted' : complete ? 'ready' : needsInformation ? 'needs_information' : underReview ? 'under_review' : 'in_progress'
      const { error: saveError } = await sb.rpc('sync_performer_stripe_connect', {
        p_performer_id: performerId,
        p_onboarding_complete: complete,
      })
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
          currentlyDueCount: account.requirements?.currently_due?.length ?? 0,
          pastDueCount: account.requirements?.past_due?.length ?? 0,
          pendingVerificationCount: account.requirements?.pending_verification?.length ?? 0,
          checkedAt: new Date().toISOString(),
          state,
        })
        return
      }
    }

    const origin = getAppUrl(req)
    stripeStep = 'account_link_create'
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/live?stripe=refresh`,
      return_url: `${origin}/live?stripe=return`,
      type: 'account_onboarding',
      collection_options: { fields: 'eventually_due' },
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
    // PostgREST errors also have a `code` (for example PostgreSQL 42501). A
    // code alone therefore does not prove that Stripe failed.
    const category = stripeType?.startsWith('Stripe') ? 'stripe' : 'internal'
    console.error('stripe_connect_failed', { category, step: stripeStep, type: stripeType ?? 'unknown', code: stripeCode ?? 'unknown', status: statusCode ?? 'unknown', requestId, reason: category === 'stripe' ? safeStripeFailureReason(error) : 'internal' })
    const accountConflict = error instanceof Error && error.message === 'Multiple live Connect accounts match the performer'
    const responseCode = accountConflict
      ? 'connect_multiple_accounts'
      : stripeStep === 'account_save'
        ? 'connect_account_save_error'
        : stripeStep === 'account_link_create'
          ? 'connect_link_error'
          : category === 'stripe' ? 'stripe_connect_error' : 'connect_server_error'
    res.status(accountConflict ? 409 : 500).json({
      error: accountConflict
        ? '複数のStripeアカウント候補が見つかりました。誤った口座への紐付けを防ぐため、HAKU運営へお問い合わせください。'
        : stripeStep === 'account_save'
          ? 'Stripeの受取口座は作成済みですが、HAKUへの紐付け保存に失敗しました。もう一度開始すると同じ口座を安全に再利用します。'
          : stripeStep === 'account_link_create'
            ? 'Stripeの登録リンクを発行できませんでした。少し待ってから再度お試しください。既存の受取口座はそのまま再利用されます。'
        : '受取設定を開始できませんでした。通信状況を確認して再度お試しください。解決しない場合はHAKU運営へお問い合わせください。',
      code: responseCode,
    })
  }
}
