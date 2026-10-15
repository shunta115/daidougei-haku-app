import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react'
import { supabaseAuthHeaders } from '../lib/supabase'
import { registrationError } from '../lib/onboarding'
import { classifyConnectGuidance } from '../lib/connectGuidance'
import { useLang } from '../../i18n/LangProvider'
import { SystemFeeExplain } from './SystemFeeExplain'

export type ConnectStatus = {
  connected: boolean
  complete: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  needsInformation: boolean
  underReview: boolean
  transfersEnabled?: boolean
  restricted?: boolean
  currentlyDueCount?: number
  pastDueCount?: number
  pendingVerificationCount?: number
  checkedAt?: string
  state?: 'not_started' | 'account_mismatch' | 'in_progress' | 'needs_information' | 'under_review' | 'ready' | 'restricted'
}

async function connectRequest(performerId: string, action?: 'status') {
  const response = await fetch('/api/stripe/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
    body: JSON.stringify({ performerId, action }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(response.status === 401 ? 'Invalid session' : body.error || 'Connect unavailable')
  }
  return response.json()
}

export function PayoutSetup({ performerId, onStatus }: { performerId: string; onStatus: (status: ConnectStatus) => void }) {
  const { t } = useLang()
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null)
  const [returnedFromStripe, setReturnedFromStripe] = useState(false)
  const [expiredLink, setExpiredLink] = useState(false)
  const [statusUnavailable, setStatusUnavailable] = useState(false)
  const inFlight = useRef(false)
  const lastChecked = useRef(0)
  const guidance = classifyConnectGuidance(status, statusUnavailable, expiredLink)
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setStatusUnavailable(false)
    try {
      const next = await connectRequest(performerId, 'status') as ConnectStatus
      if (typeof next.complete !== 'boolean') throw new Error('Invalid response')
      setStatus(next)
      onStatus(next)
      lastChecked.current = Date.now()
    } catch (e) {
      setStatusUnavailable(true)
      setError(registrationError(e, t('payoutStatusFail')))
    } finally { setBusy(false); inFlight.current = false }
  }, [onStatus, performerId, t])

  useEffect(() => {
    // A return from Stripe is not proof of completed onboarding. Recheck the account.
    const params = new URLSearchParams(window.location.search)
    // Session storage may be unavailable in restrictive browsers; never let that
    // prevent the payout settings page from loading.
    let storedReturn: string | null = null
    try { storedReturn = window.sessionStorage.getItem('pl-stripe-connect') } catch { /* Continue with URL state. */ }
    const returned = params.get('stripe') ?? storedReturn
    if (returned === 'return' || returned === 'refresh') {
      setReturnedFromStripe(true)
      setExpiredLink(returned === 'refresh')
      try { window.sessionStorage.removeItem('pl-stripe-connect') } catch { /* Optional navigation hint. */ }
      params.delete('stripe')
      const query = params.toString()
      window.history.replaceState(window.history.state, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash)
    }
    void refresh()
    const onFocus = () => { if (Date.now() - lastChecked.current > 30_000) void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const start = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setOnboardingUrl(null)
    try {
      try { window.sessionStorage.setItem('pl-stripe-return-screen', 'performer-home') } catch { /* Optional navigation hint. */ }
      const result = await connectRequest(performerId) as { url?: string }
      const url = new URL(result.url ?? '')
      if (url.protocol !== 'https:' || !(url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))) throw new Error('Invalid response')
      // Account Links expire quickly. This fallback is only for the link created by this click.
      setOnboardingUrl(url.href)
      window.location.assign(url.href)
    } catch (e) {
      setError(registrationError(e, t('payoutOpenFail')))
      setBusy(false)
      inFlight.current = false
    }
  }

  return <section className="pl-registration__section" aria-labelledby="payout-heading">
    <h2 id="payout-heading" className="pl-h2">{t('payoutTitle')}</h2>
    <p className="pl-muted">{t('payoutLead')}</p>
    <p className="pl-registration__status" role="status">
      {status?.state === 'account_mismatch' && !statusUnavailable ? '本番用の受取設定が必要です' : status?.state === 'restricted' ? 'Stripeの確認が必要です' : status?.complete ? <><CheckCircle2 size={18} />{t('payoutDone')}</> : status?.needsInformation ? t('payoutNeedMore') : status?.underReview ? t('payoutReview') : status?.connected ? t('payoutContinue') : busy ? t('payoutChecking') : t('payoutRegister')}
    </p>
    {guidance === 'expired_link' && !busy ? <p className="pl-error" role="alert">Stripeの登録リンクの有効期限が切れたか、すでに使用されています。下の「登録を続ける」を押すと、新しい安全なリンクを発行できます。最初から登録し直す必要はありません。</p> : null}
    {returnedFromStripe && !expiredLink && !busy && !error && !status?.complete ? <p className="pl-muted" role="status">Stripeの登録はまだ完了していない可能性があります。下の「登録を続ける」から途中再開できます。確認コードや本人確認が必要な場合はStripeの案内に従ってください。</p> : null}
    {status && !statusUnavailable && !status.complete && status.needsInformation && status.currentlyDueCount === 0 && (status.pastDueCount ?? 0) > 0 ? <p className="pl-error" role="alert">提出期限を過ぎた確認項目があります。「登録を続ける」からStripeの指示に従ってください。</p> : null}
    {status?.complete && !statusUnavailable ? <p className="pl-muted" role="status">Stripeの受取設定は完了しています。実際の入金には残高や振込処理などの条件があります。</p> : null}
    {guidance === 'status_unavailable' ? <p className="pl-muted" role="status">現在の受取状況を確認できません。これはStripeの利用制限が確定したという意味ではありません。通信状況を確認して「状態を更新」を押してください。</p> : null}
    {status?.connected && !status.complete && !busy && !error ? <p className="pl-muted">{status.needsInformation ? 'Stripeで追加情報の入力が必要です。' : status.underReview ? 'Stripeが提出情報を確認しています。' : status.restricted ? 'Stripe側の利用制限を確認してください。' : '登録状況を確認し、必要なら続きから再開してください。'}{typeof status.currentlyDueCount === 'number' && status.currentlyDueCount > 0 ? ` 未提出項目: ${status.currentlyDueCount}件。` : ''}</p> : null}
    {status && !status.complete && !statusUnavailable && (status.currentlyDueCount ?? 0) > 0 ? <p className="pl-muted">次にすること：下の「登録を続ける」を押して、Stripeに表示される未提出情報を入力してください。銀行口座・本人確認・事業情報など、必要な項目はアカウントごとに異なります。</p> : null}
    {status && !status.complete && !statusUnavailable && status.underReview && !status.needsInformation ? <p className="pl-muted">審査中は同じ情報を繰り返し提出せず、Stripeから追加確認が届いた場合に対応してください。</p> : null}
    {status?.checkedAt ? <p className="pl-muted">最終確認: {new Date(status.checkedAt).toLocaleString()}</p> : null}
    <p className="pl-muted">{t('payoutPrivate')}</p>
    <SystemFeeExplain compact />
    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {status?.state === 'restricted' && !statusUnavailable ? <p className="pl-error" role="alert">Stripe側で利用制限が報告されています。本人確認や追加情報の提出が必要な場合があります。「登録を続ける」からStripeの案内をご確認ください。</p> : null}
    {status?.state === 'account_mismatch' ? <p className="pl-error" role="alert">以前のテスト用または別環境の登録は本番では利用できません。既存情報を保護したまま、本番用の受取設定を開始してください。</p> : null}
    {onboardingUrl ? <p className="pl-muted">Stripe画面が開かない場合は、下のリンクを長押ししてSafariなどのブラウザで開いてください。リンクは短時間で期限切れになるため、開けない場合はこの画面からもう一度発行してください。 <a href={onboardingUrl} target="_blank" rel="noopener noreferrer">Stripeの登録画面を開く</a></p> : null}
    {!status?.complete ? <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void start()}><ExternalLink size={18} />{status?.state === 'account_mismatch' ? '本番用の受取設定を始める' : status?.connected ? t('payoutContinueStripe') : t('payoutSetAccount')}</button> : <p className="pl-muted">{t('salesBankNote')}</p>}
    <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={() => void refresh()}><RefreshCw size={18} />{busy ? t('payoutRefreshing') : t('payoutRefresh')}</button>
  </section>
}
