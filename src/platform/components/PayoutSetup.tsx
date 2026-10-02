import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react'
import { supabaseAuthHeaders } from '../lib/supabase'
import { registrationError } from '../lib/onboarding'
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
}

async function connectRequest(performerId: string, action?: 'status') {
  const response = await fetch('/api/stripe/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
    body: JSON.stringify({ performerId, action }),
  })
  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Invalid session' : 'Connect unavailable')
  }
  return response.json()
}

export function PayoutSetup({ performerId, onStatus }: { performerId: string; onStatus: (status: ConnectStatus) => void }) {
  const { t } = useLang()
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const lastChecked = useRef(0)
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const next = await connectRequest(performerId, 'status') as ConnectStatus
      if (typeof next.complete !== 'boolean') throw new Error('Invalid response')
      setStatus(next)
      onStatus(next)
      lastChecked.current = Date.now()
    } catch (e) {
      setError(registrationError(e, t('payoutStatusFail')))
    } finally { setBusy(false); inFlight.current = false }
  }, [onStatus, performerId, t])

  useEffect(() => {
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
    try {
      const result = await connectRequest(performerId) as { url?: string }
      const url = new URL(result.url ?? '')
      if (url.protocol !== 'https:' || !(url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))) throw new Error('Invalid response')
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
      {status?.complete ? <><CheckCircle2 size={18} />{t('payoutDone')}</> : status?.needsInformation ? t('payoutNeedMore') : status?.underReview ? t('payoutReview') : status?.connected ? t('payoutContinue') : busy ? t('payoutChecking') : t('payoutRegister')}
    </p>
    <p className="pl-muted">{t('payoutPrivate')}</p>
    <SystemFeeExplain compact />
    {status?.underReview && !status.needsInformation && !status.complete ? <p className="pl-muted">{t('payoutReviewNote')}</p> : null}
    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {!status?.complete ? <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void start()}><ExternalLink size={18} />{status?.connected ? t('payoutContinueStripe') : t('payoutSetAccount')}</button> : <a className="pl-btn pl-btn--ghost pl-btn--block" href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer"><ExternalLink size={18} />{t('salesOpenStripe')}</a>}
    <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={() => void refresh()}><RefreshCw size={18} />{busy ? t('payoutRefreshing') : t('payoutRefresh')}</button>
  </section>
}
