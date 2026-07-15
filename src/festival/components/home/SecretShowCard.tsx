import { useCallback, useState } from 'react'
import { readSecretNotifyOptIn, toggleSecretNotifyOptIn } from '../../lib/secretNotifyStorage'

export function SecretShowCard() {
  const [, setT] = useState(0)
  const bump = useCallback(() => setT((n) => n + 1), [])
  const on = readSecretNotifyOptIn()

  return (
    <section className="fe-secret" aria-label="シークレットショー">
      <div className="fe-secret__glow" aria-hidden="true" />
      <div className="fe-secret__inner">
        <p className="fe-secret__eyebrow" lang="en">
          SECRET SHOW
        </p>
        <h2 className="fe-secret__title">都市の隙間で、短いセッション</h2>
        <p className="fe-secret__blur">
          <span className="fe-secret__blur-line">TIME · 深夜帯のどこか</span>
          <span className="fe-secret__blur-line">PLACE · 水辺のネオン帯</span>
        </p>
        <p className="fe-secret__hint">詳細は当日フリップのみ。プッシュはモックです。</p>
        <button
          type="button"
          className={`fe-secret__btn${on ? ' fe-secret__btn--on' : ''}`}
          onClick={() => {
            toggleSecretNotifyOptIn()
            bump()
          }}
        >
          {on ? '通知 ON（端末保存）' : '通知を受け取る'}
        </button>
      </div>
    </section>
  )
}
