import type { CSSProperties } from 'react'
import type { Performer } from '../../types'
import { canWatchLiveStream } from '../../lib/productionGuard'
import { SafeImg } from '../shared/SafeImg'

export type HomeStreamNowProps = {
  livePerformers: readonly Performer[]
  onWatch: (performerId: string) => void
  onSupport: (performerId: string) => void
  /** 空のときセクション自体を出さない（ホーム整理用） */
  hideWhenEmpty?: boolean
}

export function HomeStreamNow({ livePerformers, onWatch, onSupport, hideWhenEmpty }: HomeStreamNowProps) {
  if (hideWhenEmpty && livePerformers.length === 0) return null

  return (
    <section className="fe-stream-hero" aria-labelledby="fe-stream-hero-title">
      <div className="fe-stream-hero__glow" aria-hidden="true" />
      <header className="fe-stream-hero__head">
        <p className="fe-stream-hero__eyebrow" lang="en">
          LIVE NOW
        </p>
        <h2 id="fe-stream-hero-title" className="fe-stream-hero__title">
          今、世界のどこかで大道芸が始まっている
        </h2>
        <p className="fe-stream-hero__sub">
          承認されたパフォーマーだけが配信できます。視聴は無料 · 応援はWEBで完結。
        </p>
      </header>

      {livePerformers.length === 0 ? (
        <div className="fe-stream-hero__empty">
          <p className="fe-stream-hero__empty-t">現在ライブ配信中のパフォーマーはいません</p>
          <p className="fe-stream-hero__empty-h">次の配信をお楽しみに — タイムテーブルもご確認ください</p>
        </div>
      ) : (
        <ul className="fe-stream-hero__list">
          {livePerformers.map((p) => {
            const watchable = canWatchLiveStream(p)
            return (
              <li key={p.id}>
                <article
                  className="fe-stream-card fe-stream-card--live"
                  style={{ '--fe-stream-grad': p.gradient } as CSSProperties}
                >
                  <div className="fe-stream-card__visual" aria-hidden="true">
                    {p.photoUrl ? (
                      <SafeImg className="fe-stream-card__photo" src={p.photoUrl} alt="" loading="lazy" />
                    ) : null}
                    <span className="fe-stream-card__live-badge" lang="en">
                      LIVE
                    </span>
                  </div>
                  <div className="fe-stream-card__body">
                    <p className="fe-stream-card__name">{p.nameJa || p.name}</p>
                    <p className="fe-stream-card__meta">
                      <span>{p.country}</span>
                      <span className="fe-stream-card__dot" aria-hidden="true">
                        ·
                      </span>
                      <span>{p.genre ?? p.actJa}</span>
                    </p>
                    {p.streamTitle ? <p className="fe-stream-card__title">{p.streamTitle}</p> : null}
                    <p className="fe-stream-card__status" lang="en">
                      <span className="fe-stream-card__status-dot" aria-hidden="true" />
                      配信ステータス · LIVE
                    </p>
                    <div className="fe-stream-card__actions">
                      <button
                        type="button"
                        className="fe-stream-card__watch"
                        disabled={!watchable}
                        onClick={() => watchable && onWatch(p.id)}
                      >
                        {watchable ? '視聴する' : '配信準備中'}
                      </button>
                      <button type="button" className="fe-stream-card__support" onClick={() => onSupport(p.id)}>
                        応援する
                      </button>
                    </div>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
