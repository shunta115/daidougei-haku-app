import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react'
import { supabaseAuthHeaders } from '../lib/supabase'
import { registrationError } from '../lib/onboarding'

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
      setError(registrationError(e, '受取状況を確認できませんでした。「状態を更新」で再確認してください。'))
    } finally { setBusy(false); inFlight.current = false }
  }, [performerId, onStatus])

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
      setError(registrationError(e, '受取設定を開けませんでした。通信を確認して、もう一度お試しください。'))
      setBusy(false)
      inFlight.current = false
    }
  }

  return <section className="pl-registration__section" aria-labelledby="payout-heading">
    <h2 id="payout-heading" className="pl-h2">売上の受取設定</h2>
    <p className="pl-registration__status" role="status">
      {status?.complete ? <><CheckCircle2 size={18} />受取設定が完了しました</> : status?.needsInformation ? '追加の入力が必要です' : status?.underReview ? 'Stripeで本人確認中です' : status?.connected ? '受取設定を続けてください' : busy ? '受取状況を確認しています…' : '本人確認・振込口座を登録'}
    </p>
    <p className="pl-muted">本名・本人確認書類・振込口座はStripeの画面に入力します。公開プロフィールには表示しません。</p>
    {status?.underReview && !status.needsInformation && !status.complete ? <p className="pl-muted">確認が終わると状態が更新されます。追加のご案内がある場合はStripeからのメールをご確認ください。</p> : null}
    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {!status?.complete ? <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void start()}><ExternalLink size={18} />{status?.connected ? 'Stripeで登録を続ける' : 'Stripeで受取設定を始める'}</button> : null}
    <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={busy} onClick={() => void refresh()}><RefreshCw size={18} />{busy ? '確認中…' : '状態を更新'}</button>
  </section>
}
