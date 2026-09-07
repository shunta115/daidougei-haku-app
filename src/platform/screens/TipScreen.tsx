import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import { formatYen, TIP_PRESETS_JPY } from '../lib/money'
import { getPerformer } from '../lib/api'
import { supabaseAuthHeaders } from '../lib/supabase'
import { spaGo, PLATFORM_PATH } from '../../app/routes'
import { trackProductEvent } from '../lib/track'
import type { Performer } from '../lib/types'

type TipProps = {
  performerId: string
  onBack: () => void
  onDone: () => void
  returnToLive?: boolean
}

export function TipScreen({ performerId, onBack, returnToLive }: TipProps) {
  const { user } = useAuth()
  const { t } = useLang()
  const [p, setP] = useState<Performer | null>(null)
  const [amount, setAmount] = useState<number>(TIP_PRESETS_JPY[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPerformer(performerId).then(setP).catch(() => setP(null))
  }, [performerId])

  const pay = async () => {
    if (!user) {
      spaGo(`${PLATFORM_PATH}?auth=1&tipTo=${encodeURIComponent(performerId)}`)
      return
    }
    setBusy(true)
    setError(null)
    trackProductEvent('tip_start', { performerId })
    try {
      const res = await fetch('/api/stripe/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
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
    <div className="pl-tip">
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        {t('back')}
      </button>
      {p?.photo_url ? (
        <div
          className="pl-tip-hero"
          style={{ backgroundImage: `url(${p.photo_url})` }}
        >
          <div className="pl-tip-hero__shade" />
          <p className="pl-tip-hero__name">{p.stage_name}</p>
        </div>
      ) : (
        <h1 className="pl-h1">
          {t('tipHeading')} {p?.stage_name ?? ''}
        </h1>
      )}
      <p className="pl-muted">{p?.support_blurb || t('tipSecure')}</p>

      <p className="pl-tip__amount">{formatYen(amount)}</p>
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
        <span className="pl-label">{t('customAmount')}</span>
        <input
          className="pl-input"
          type="number"
          min={100}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Math.max(100, Number(e.target.value) || 100))}
        />
      </label>

      <button type="button" className="pl-btn pl-btn--block pl-btn--tip" disabled={busy || amount < 100} onClick={() => void pay()}>
        {busy ? t('processing') : `${t('payNow')} ${formatYen(amount)}`}
      </button>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={onBack}>
        {t('cancel')}
      </button>
      {!user ? (
        <button
          type="button"
          className="pl-btn pl-btn--block"
          onClick={() => spaGo(`${PLATFORM_PATH}?auth=1&tipTo=${encodeURIComponent(performerId)}`)}
        >
          {t('loginToContinue')}
        </button>
      ) : null}
      {error ? <p className="pl-error">{error}</p> : null}
    </div>
  )
}
