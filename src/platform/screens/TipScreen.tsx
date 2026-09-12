import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import { formatYen, TIP_PRESET_LABELS_JA, TIP_PRESETS_JPY } from '../lib/money'
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
  const { lang, t } = useLang()
  const [p, setP] = useState<Performer | null>(null)
  const [amount, setAmount] = useState<number>(TIP_PRESETS_JPY[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setSafeAmount = (value: number) => {
    setAmount(Math.min(100000, Math.max(100, Math.floor(value) || 100)))
  }

  const selectAmount = (value: number, source: string) => {
    setSafeAmount(value)
    trackProductEvent('tip_amount_select', { performerId, props: { amount_yen: value, source } })
  }

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
    trackProductEvent('tip_checkout_start', { performerId, props: { amount_yen: amount } })
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
      <section
        className={`pl-tip-hero${p?.photo_url ? ' pl-tip-hero--photo' : ''}`}
        style={p?.photo_url ? { backgroundImage: `url(${p.photo_url})` } : undefined}
        aria-labelledby="pl-tip-title"
      >
        <div className="pl-tip-hero__shade" />
        <div className="pl-tip-hero__body">
          <p className="pl-tip-hero__k">{lang === 'ja' ? '応援' : 'Support'}</p>
          <h1 id="pl-tip-title" className="pl-tip-hero__name">
            {p?.stage_name ? `${p.stage_name}へ応援を届ける` : t('tipHeading')}
          </h1>
          <p className="pl-tip-hero__copy">
            {p?.support_blurb || '気持ちが動いた瞬間に、拍手の続きとして応援できます。決済はStripeで安全に処理されます。'}
          </p>
        </div>
      </section>

      <section className="pl-tip-decision" aria-label="応援金額の選択">
      <p className="pl-tip__amount">{formatYen(amount)}</p>
      <div className="pl-tip-presets" aria-label="応援金額">
        {TIP_PRESETS_JPY.map((yen) => (
          <button
            key={yen}
            type="button"
            className="pl-tip-preset"
            data-on={amount === yen}
            onClick={() => selectAmount(yen, 'preset')}
          >
            <span className="pl-tip-preset__label">{TIP_PRESET_LABELS_JA[yen].label}</span>
            <span className="pl-tip-preset__amount">{formatYen(yen)}</span>
            {TIP_PRESET_LABELS_JA[yen].note ? <span className="pl-tip-preset__note">{TIP_PRESET_LABELS_JA[yen].note}</span> : null}
          </button>
        ))}
      </div>

      <label>
        <span className="pl-label">{t('customAmount')}</span>
        <input
          className="pl-input"
          type="number"
          min={100}
          max={100000}
          step={100}
          value={amount}
          onChange={(e) => setSafeAmount(Number(e.target.value))}
          onBlur={() => trackProductEvent('tip_amount_select', { performerId, props: { amount_yen: amount, source: 'custom' } })}
        />
      </label>

      <button type="button" className="pl-btn pl-btn--block pl-btn--tip" disabled={busy || amount < 100} onClick={() => void pay()}>
        {busy ? t('processing') : `❤️ 応援を届ける ${formatYen(amount)}`}
      </button>
      </section>
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
