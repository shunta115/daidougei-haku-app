import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Performer } from '../../types'
import {
  BETA_SUPPORT_MESSAGE,
  canProcessOnlineSupport,
  isValidHttpUrl,
} from '../../lib/productionGuard'

const PRESET_AMOUNTS = [500, 1000, 3000, 5000] as const

const SEED_CHAT = [
  { id: 'c1', user: 'Guest · Tokyo', text: '音が澄んでいて最高です…！' },
  { id: 'c2', user: 'Guest · Osaka', text: '画面越しでも鳥肌立った' },
  { id: 'c3', user: 'Guest · Paris', text: 'Bon courage depuis la France' },
]

const SEED_CHEERS = [
  { id: 'h1', user: 'ファンA', text: '今日も世界に届けて！' },
  { id: 'h2', user: 'ファンB', text: '次の曲も楽しみにしてます' },
]

type LiveStreamScreenProps = {
  performer: Performer
  focusTipOnMount?: boolean
  onClose: () => void
  onBetaSupport?: () => void
}

export function LiveStreamScreen({ performer, focusTipOnMount, onClose, onBetaSupport }: LiveStreamScreenProps) {
  const [chatInput, setChatInput] = useState('')
  const [cheerInput, setCheerInput] = useState('')
  const [chat, setChat] = useState(SEED_CHAT)
  const [cheers, setCheers] = useState(SEED_CHEERS)
  const [customAmount, setCustomAmount] = useState('')
  const [thanks, setThanks] = useState<{ amount: number } | null>(null)

  const displayName = performer.nameJa || performer.name
  const tipSectionId = useMemo(() => 'fe-live-tip', [])
  const watchUrl = isValidHttpUrl(performer.streamUrl) ? performer.streamUrl : undefined
  const supportEnabled = canProcessOnlineSupport()

  useEffect(() => {
    if (!focusTipOnMount) return
    const t = window.setTimeout(() => {
      document.getElementById(tipSectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [focusTipOnMount, tipSectionId])

  const appendChat = useCallback(() => {
    const text = chatInput.trim()
    if (!text) return
    setChat((rows) => [...rows, { id: `local-${Date.now()}`, user: 'あなた', text }])
    setChatInput('')
  }, [chatInput])

  const appendCheer = useCallback(() => {
    const text = cheerInput.trim()
    if (!text) return
    setCheers((rows) => [...rows, { id: `local-${Date.now()}`, user: 'あなた', text }])
    setCheerInput('')
  }, [cheerInput])

  const openWebTip = useCallback(
    (amount: number) => {
      if (!supportEnabled) {
        onBetaSupport?.()
        return
      }
      const base = performer.supportUrl || performer.tipLinks?.[0]?.url
      if (!isValidHttpUrl(base)) return
      const url = `${base}${base.includes('?') ? '&' : '?'}amount=${amount}`
      window.open(url, '_blank', 'noopener,noreferrer')
      setThanks({ amount })
    },
    [performer, supportEnabled, onBetaSupport],
  )

  return (
    <div className="fe-overlay fe-overlay--stream">
      <main className="fe-live-page">
        <header className="fe-live-page__head">
          <button type="button" className="fe-live-page__back" onClick={onClose}>
            ← 戻る
          </button>
          <div className="fe-live-page__meta">
            <p className="fe-live-page__name">{displayName}</p>
            <p className="fe-live-page__region">
              {performer.country} · {performer.genre ?? performer.actJa}
            </p>
          </div>
          <span className="fe-live-page__badge" lang="en">
            LIVE
          </span>
        </header>

        <section className="fe-live-player" aria-label="配信画面">
          <div className="fe-live-player__frame" style={{ background: performer.gradient }}>
            <div className="fe-live-player__scanlines" aria-hidden="true" />
            {watchUrl ? (
              <>
                <p className="fe-live-player__prep">配信を開く</p>
                <p className="fe-live-player__hint">{performer.streamTitle ?? 'グローバル配信セッション'}</p>
                <a
                  className="fe-btn fe-btn--primary"
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  配信ページを開く
                </a>
              </>
            ) : (
              <>
                <p className="fe-live-player__prep">配信準備中</p>
                <p className="fe-live-player__hint">
                  {performer.streamTitle ?? '独自ライブ配信システム準備中'}
                </p>
              </>
            )}
            <p className="fe-live-player__globe" aria-hidden="true">
              🌍
            </p>
          </div>
        </section>

        <div className="fe-live-panels">
          <section className="fe-live-panel" aria-label="チャット">
            <h2 className="fe-live-panel__title">チャット</h2>
            <ul className="fe-live-feed">
              {chat.map((m) => (
                <li key={m.id} className="fe-live-feed__row">
                  <span className="fe-live-feed__user">{m.user}</span>
                  <span className="fe-live-feed__text">{m.text}</span>
                </li>
              ))}
            </ul>
            <div className="fe-live-compose">
              <input
                className="fe-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="コメントを送る"
                onKeyDown={(e) => e.key === 'Enter' && appendChat()}
              />
              <button type="button" className="fe-btn fe-btn--glass" onClick={appendChat}>
                送信
              </button>
            </div>
          </section>

          <section className="fe-live-panel" aria-label="応援コメント">
            <h2 className="fe-live-panel__title">応援コメント</h2>
            <ul className="fe-live-feed fe-live-feed--cheer">
              {cheers.map((m) => (
                <li key={m.id} className="fe-live-feed__row">
                  <span className="fe-live-feed__user">{m.user}</span>
                  <span className="fe-live-feed__text">{m.text}</span>
                </li>
              ))}
            </ul>
            <div className="fe-live-compose">
              <input
                className="fe-input"
                value={cheerInput}
                onChange={(e) => setCheerInput(e.target.value)}
                placeholder="応援メッセージ"
                onKeyDown={(e) => e.key === 'Enter' && appendCheer()}
              />
              <button type="button" className="fe-btn fe-btn--glass" onClick={appendCheer}>
                送る
              </button>
            </div>
          </section>
        </div>

        <section
          id={tipSectionId}
          className={`fe-live-tip${focusTipOnMount ? ' fe-live-tip--focus' : ''}`}
          aria-label="WEB投げ銭"
        >
          <h2 className="fe-live-tip__title">WEB完結投げ銭</h2>
          <p className="fe-live-tip__lead">
            {supportEnabled
              ? 'お支払いは外部の安全な決済ページで行います。アプリ内課金はありません。'
              : BETA_SUPPORT_MESSAGE}
          </p>
          <div className="fe-live-tip__grid">
            {PRESET_AMOUNTS.map((yen) => (
              <button
                key={yen}
                type="button"
                className="fe-live-tip__amt"
                onClick={() => openWebTip(yen)}
              >
                ¥{yen.toLocaleString('ja-JP')}
              </button>
            ))}
          </div>
          <div className="fe-live-tip__custom">
            <label className="fe-field">
              <span className="fe-label">自由入力（円）</span>
              <input
                className="fe-input"
                inputMode="numeric"
                placeholder="例: 2000"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d]/g, ''))}
              />
            </label>
            <button
              type="button"
              className="fe-btn fe-btn--primary fe-btn--block"
              disabled={!customAmount || Number(customAmount) < 100}
              onClick={() => openWebTip(Number(customAmount))}
            >
              {supportEnabled ? '外部サイトで応援する' : 'β版準備中'}
            </button>
          </div>
          <p className="fe-live-tip__note">
            投げ銭の合計金額は表示しません。あなたの応援がパフォーマーに届きます。
          </p>
        </section>

        {thanks && supportEnabled ? (
          <div className="fe-live-thanks" role="dialog" aria-labelledby="fe-live-thanks-title">
            <div className="fe-live-thanks__card">
              <p className="fe-live-thanks__k" lang="en">
                THANK YOU
              </p>
              <h3 id="fe-live-thanks-title" className="fe-live-thanks__title">
                応援ありがとうございます
              </h3>
              <p className="fe-live-thanks__body">
                {displayName} へ ¥{thanks.amount.toLocaleString('ja-JP')} のご支援をお選びいただきました。
                決済ページでお手続きが完了すると、パフォーマーに届きます。
              </p>
              <button type="button" className="fe-btn fe-btn--primary fe-btn--block" onClick={() => setThanks(null)}>
                配信に戻る
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
