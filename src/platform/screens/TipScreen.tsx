import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { formatYen, TIP_PRESETS_JPY } from '../lib/money'
import { getPerformer } from '../lib/api'
import { useEffect } from 'react'
import type { Performer } from '../lib/types'

type TipProps = {
  performerId: string
  onBack: () => void
  onDone: () => void
  returnToLive?: boolean
}

export function TipScreen({ performerId, onBack, onDone, returnToLive }: TipProps) {
  const { user } = useAuth()
  const [p, setP] = useState<Performer | null>(null)
  const [amount, setAmount] = useState<number>(TIP_PRESETS_JPY[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPerformer(performerId).then(setP).catch(() => setP(null))
  }, [performerId])

  const pay = async () => {
    if (!user) {
      setError('Sign in to tip')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performerId,
          fanId: user.id,
          amountYen: amount,
          returnTo: returnToLive ? 'live' : undefined,
        }),
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || 'Checkout failed')
      window.location.href = json.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tip failed')
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        Back
      </button>
      <h1 className="pl-h1">Tip {p?.stage_name ?? 'performer'}</h1>
      <p className="pl-muted">{p?.support_blurb || 'Support this performer directly.'}</p>

      <div className="pl-chip-row">
        {TIP_PRESETS_JPY.map((yen) => (
          <button
            key={yen}
            type="button"
            className="pl-chip"
            data-on={amount === yen}
            onClick={() => setAmount(yen)}
          >
            {formatYen(yen)}
          </button>
        ))}
      </div>

      <label>
        <span className="pl-label">Custom amount (JPY)</span>
        <input
          className="pl-input"
          type="number"
          min={100}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Math.max(100, Number(e.target.value) || 100))}
        />
      </label>

      <button type="button" className="pl-btn pl-btn--block" disabled={busy || amount < 100} onClick={() => void pay()}>
        {busy ? 'Redirecting…' : `Pay ${formatYen(amount)}`}
      </button>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={onDone}>
        Cancel
      </button>
      {error ? <p className="pl-error">{error}</p> : null}
      <p className="pl-muted">Secure checkout via Stripe. Platform fee 10%.</p>
    </>
  )
}
