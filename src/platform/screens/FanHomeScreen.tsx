import { useEffect, useMemo, useState } from 'react'
import { listFollowedPerformers, searchPerformers, listLivePerformers } from '../lib/api'
import { useAuth } from '../lib/auth'
import { isValidHttpUrl } from '../lib/url'
import type { Performer } from '../lib/types'
import '../../festival/festival.css'
import './fanHome.css'

type FanHomeProps = {
  onOpenPerformer: (id: string) => void
  onOpenSearch: () => void
  onTip: (id: string) => void
}

type EventMode = 'normal' | 'rain'

function shareApp() {
  const url = window.location.origin
  const title = '大道芸博'
  const text = 'ストリートパフォーマーのライブと投げ銭 — 大道芸博'
  if (navigator.share) {
    void navigator.share({ title, text, url }).catch(() => undefined)
    return
  }
  void navigator.clipboard?.writeText(url)
}

export function FanHomeScreen({ onOpenPerformer, onOpenSearch, onTip }: FanHomeProps) {
  const { user } = useAuth()
  const [mode, setMode] = useState<EventMode>(() => {
    const saved = window.localStorage.getItem('pl-event-mode')
    return saved === 'rain' ? 'rain' : 'normal'
  })
  const [live, setLive] = useState<Performer[]>([])
  const [roster, setRoster] = useState<Performer[]>([])
  const [oshi, setOshi] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem('pl-event-mode', mode)
  }, [mode])

  useEffect(() => {
    const load = async () => {
      const [liveRows, allRows] = await Promise.all([listLivePerformers(), searchPerformers('')])
      setLive(liveRows)
      setRoster(allRows)
      if (user) {
        const favs = await listFollowedPerformers(user.id)
        setOshi(favs)
      } else {
        setOshi([])
      }
      setError(null)
    }
    load().catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
    const timer = window.setInterval(() => {
      load().catch(() => undefined)
    }, 12000)
    return () => window.clearInterval(timer)
  }, [user])

  const rain = mode === 'rain'
  const todayRail = useMemo(() => {
    let rows = [...roster]
    if (rain) {
      rows = rows.filter((p) => p.share_location || p.city || p.is_live)
    }
    return rows.slice(0, 12)
  }, [roster, rain])

  const mapRows = useMemo(
    () => roster.filter((p) => p.is_live && p.share_location && p.lat != null && p.lng != null),
    [roster],
  )

  const liveOshi = useMemo(() => {
    const ids = new Set(oshi.map((p) => p.id))
    return live.filter((p) => ids.has(p.id))
  }, [oshi, live])

  const featuredLive = live[0] ?? null
  const nextPick = roster.find((p) => !p.is_live) ?? null

  return (
    <main className={`fe-main fe-main--home fe-main--h6 fe-main--stream-home pl-fan-home${rain ? ' fe-main--h6-rain' : ''}`}>
      <header className="fe-strip">
        <div className="fe-strip__brand">
          <span className="fe-strip__dot" aria-hidden="true" />
          <span className="fe-strip__name">大道芸博</span>
          {live.length > 0 ? <span className="fe-strip__pill">LIVE</span> : null}
        </div>
        <div className="fe-strip__meta">
          <span>ストリート · 毎日</span>
          <span className="fe-strip__sep">·</span>
          <span>β</span>
        </div>
        <button type="button" className="fe-strip__share" onClick={() => shareApp()} aria-label="シェア">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <section className="fe-h6-weather" aria-label="開催モード">
        <p className="fe-h6-weather__k">開催モード</p>
        <div className={`fe-h6-weather__track${rain ? ' fe-h6-weather__track--rain' : ''}`}>
          <button
            type="button"
            className={`fe-h6-weather__btn${!rain ? ' fe-h6-weather__btn--on' : ''}`}
            aria-pressed={!rain}
            onClick={() => setMode('normal')}
          >
            ☀ 通常開催
          </button>
          <button
            type="button"
            className={`fe-h6-weather__btn${rain ? ' fe-h6-weather__btn--on' : ''}`}
            aria-pressed={rain}
            onClick={() => setMode('rain')}
          >
            ☂ 雨天対応
          </button>
        </div>
        <p className="fe-h6-weather__note">
          {rain
            ? '位置共有中・屋内寄りのパフォーマーを優先表示します'
            : '世界中のストリートパフォーマーのライブと投げ銭'}
        </p>
      </section>

      {error ? <p className="pl-error">{error}</p> : null}

      <section className="fe-home-venue-block" aria-labelledby="fe-home-venue-title">
        <h2 id="fe-home-venue-title" className="fe-home-venue-block__title">
          会場の今
        </h2>
        <p className="fe-home-venue-block__sub">LIVE · 次に見るべきパフォーマー · 街の空気</p>

        <div className={`fe-h6-live${featuredLive ? ' fe-h6-live--on' : ''}`}>
          <div className="fe-h6-live__head">
            <span className="fe-h6-live__tag" lang="en">
              {featuredLive ? 'LIVE NOW' : 'STANDBY'}
            </span>
            {featuredLive ? <span className="fe-h6-live__pulse" aria-hidden="true" /> : null}
          </div>
          {featuredLive ? (
            <button type="button" className="fe-h6-live__card" onClick={() => onOpenPerformer(featuredLive.id)}>
              <div
                className="fe-h6-live__photo"
                style={
                  featuredLive.photo_url
                    ? { backgroundImage: `url(${featuredLive.photo_url})` }
                    : undefined
                }
              >
                <span className="fe-h6-live__livepill">LIVE</span>
              </div>
              <div className="fe-h6-live__info">
                <p className="fe-h6-live__genre">{featuredLive.genre || 'Street'}</p>
                <p className="fe-h6-live__name">{featuredLive.stage_name}</p>
                <p className="fe-h6-live__meta">
                  {[featuredLive.city, featuredLive.country].filter(Boolean).join(' · ') || 'On the street'}
                </p>
              </div>
            </button>
          ) : (
            <div className="fe-h6-live__card fe-h6-live__card--next">
              <div className="fe-h6-live__info">
                <p className="fe-h6-live__nextk">いま配信中の枠はありません</p>
                <p className="fe-h6-live__meta">検索からパフォーマーを見つけてフォローしましょう</p>
              </div>
            </div>
          )}
          {nextPick ? (
            <button type="button" className="fe-h6-live__card fe-h6-live__card--next" onClick={() => onOpenPerformer(nextPick.id)}>
              <div className="fe-h6-live__info">
                <p className="fe-h6-live__nextk">NEXT</p>
                <p className="fe-h6-live__name">{nextPick.stage_name}</p>
                <p className="fe-h6-live__meta">{nextPick.genre || 'Performer'}</p>
              </div>
            </button>
          ) : null}
          <button type="button" className="fe-h6-live__map" onClick={onOpenSearch}>
            出演者を探す
          </button>
        </div>

        <section className={`fe-h6-rail${rain ? ' fe-h6-rail--rain' : ''}`} aria-label="今日のタイムテーブル">
          <div className="fe-h6-rail__head">
            <h2 className="fe-h6-rail__title">今日の公演</h2>
            <button type="button" className="fe-h6-rail__all" onClick={onOpenSearch}>
              すべて
            </button>
          </div>
          <div className="fe-h6-rail__scroll" role="list">
            {todayRail.length === 0 ? (
              <p className="fe-h6-rail__empty">公開中のパフォーマーはまだいません</p>
            ) : null}
            {todayRail.map((p) => (
              <button
                key={p.id}
                type="button"
                role="listitem"
                className={[
                  'fe-h6-rail__card',
                  p.is_live ? 'fe-h6-rail__card--live' : '',
                  rain ? 'fe-h6-rail__card--rainctx' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onOpenPerformer(p.id)}
              >
                <span className="fe-h6-rail__time">{p.is_live ? 'NOW' : 'TODAY'}</span>
                <span className="fe-h6-rail__name">{p.stage_name}</span>
                <span className="fe-h6-rail__stage">{p.genre || p.city || 'Street'}</span>
                {p.is_live ? <span className="fe-h6-rail__badge fe-h6-rail__badge--live">LIVE</span> : null}
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="fe-stream-hero" aria-labelledby="fe-stream-hero-title">
        <div className="fe-stream-hero__glow" aria-hidden="true" />
        <header className="fe-stream-hero__head">
          <p className="fe-stream-hero__eyebrow" lang="en">
            LIVE NOW
          </p>
          <h2 id="fe-stream-hero-title" className="fe-stream-hero__title">
            今、世界のどこかで大道芸が始まっている
          </h2>
          <p className="fe-stream-hero__sub">承認されたパフォーマーだけが配信できます。視聴は無料 · 応援はWEBで完結。</p>
        </header>

        {live.length === 0 ? (
          <div className="fe-stream-hero__empty">
            <p className="fe-stream-hero__empty-t">現在ライブ配信中のパフォーマーはいません</p>
            <p className="fe-stream-hero__empty-h">フォローしておくと、次の配信を逃しません</p>
          </div>
        ) : (
          <ul className="fe-stream-hero__list">
            {live.map((p) => {
              const watchable = isValidHttpUrl(p.stream_url)
              return (
                <li key={p.id}>
                  <article className="fe-stream-card fe-stream-card--live">
                    <div className="fe-stream-card__visual" aria-hidden="true">
                      {p.photo_url ? (
                        <img className="fe-stream-card__photo" src={p.photo_url} alt="" loading="lazy" />
                      ) : null}
                      <span className="fe-stream-card__live-badge" lang="en">
                        LIVE
                      </span>
                    </div>
                    <div className="fe-stream-card__body">
                      <p className="fe-stream-card__name">{p.stage_name}</p>
                      <p className="fe-stream-card__meta">
                        <span>{p.country || 'World'}</span>
                        <span className="fe-stream-card__dot" aria-hidden="true">
                          ·
                        </span>
                        <span>{p.genre || 'Street'}</span>
                      </p>
                      <p className="fe-stream-card__status" lang="en">
                        <span className="fe-stream-card__status-dot" aria-hidden="true" />
                        配信ステータス · LIVE
                      </p>
                      <div className="fe-stream-card__actions">
                        <button
                          type="button"
                          className="fe-stream-card__watch"
                          disabled={!watchable}
                          onClick={() => {
                            if (watchable && p.stream_url) window.open(p.stream_url, '_blank', 'noopener,noreferrer')
                            else onOpenPerformer(p.id)
                          }}
                        >
                          {watchable ? '視聴する' : 'プロフィール'}
                        </button>
                        <button type="button" className="fe-stream-card__support" onClick={() => onTip(p.id)}>
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

      <div className="fe-h6-maprow">
        <button type="button" className="fe-h6-maprow__primary" onClick={onOpenSearch}>
          会場マップ
        </button>
        <button type="button" className="fe-h6-maprow__ghost" onClick={onOpenSearch}>
          公演エリアを見る
        </button>
      </div>
      <p className="fe-home-loc-note" role="note">
        世界マップは準備中です。位置共有ONのライブは下に表示されます。
      </p>

      <section className="pl-map-panel" aria-label="位置共有中のライブ">
        <h2 className="fe-h6-rail__title">いま街にいる</h2>
        {mapRows.length === 0 ? (
          <p className="fe-h6-rail__empty">位置を共有中のライブはありません</p>
        ) : (
          <div className="pl-map-panel__list">
            {mapRows.map((p) => (
              <button key={p.id} type="button" className="pl-map-panel__card" onClick={() => onOpenPerformer(p.id)}>
                <span className="pl-map-panel__live">LIVE</span>
                <span className="pl-map-panel__name">{p.stage_name}</span>
                <span className="pl-map-panel__meta">
                  {p.city || 'Street'} · {p.lat?.toFixed(2)}, {p.lng?.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="fe-home-tips" id="fe-home-tips" aria-labelledby="fe-home-tips-h">
        <div className="fe-home-tips__glow" aria-hidden="true" />
        <div className="fe-home-tips__inner">
          {liveOshi.length > 0 ? (
            <>
              <p className="fe-home-tips__eyebrow fe-home-tips__eyebrow--live" lang="en">
                OSHI LIVE
              </p>
              <h2 id="fe-home-tips-h" className="fe-home-tips__title">
                推しがいま配信中
              </h2>
              <p className="fe-home-tips__text">
                {liveOshi.map((p) => p.stage_name).join(' / ')} — 視聴は無料 · 応援はWEBで完結。
              </p>
              <div className="fe-home-tips__actions">
                <button type="button" className="fe-btn fe-btn--primary" onClick={() => onOpenPerformer(liveOshi[0].id)}>
                  今すぐ見る
                </button>
                <button type="button" className="fe-btn fe-btn--glass" onClick={() => onTip(liveOshi[0].id)}>
                  投げ銭する
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="fe-home-tips__eyebrow" lang="en">
                SUPPORT
              </p>
              <h2 id="fe-home-tips-h" className="fe-home-tips__title">
                推しを、すぐ応援できる場所へ
              </h2>
              <p className="fe-home-tips__text">
                フォローすると、LIVE時にここに案内が出ます。投げ銭はStripeで完結します。
              </p>
              <div className="fe-home-tips__actions">
                <button type="button" className="fe-btn fe-btn--primary" onClick={onOpenSearch}>
                  推しを探す
                </button>
                {oshi[0] ? (
                  <button type="button" className="fe-btn fe-btn--glass" onClick={() => onTip(oshi[0].id)}>
                    応援する
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

      {oshi.length > 0 ? (
        <section className="pl-oshi-rail" aria-label="推しリスト">
          <div className="fe-h6-rail__head">
            <h2 className="fe-h6-rail__title">推しリスト</h2>
          </div>
          <div className="pl-oshi-rail__row">
            {oshi.map((p) => (
              <button key={p.id} type="button" className="pl-oshi-rail__card" onClick={() => onOpenPerformer(p.id)}>
                {p.photo_url ? <img src={p.photo_url} alt="" className="pl-oshi-rail__av" /> : <span className="pl-oshi-rail__av pl-oshi-rail__av--ph" />}
                <span className="pl-oshi-rail__name">{p.stage_name}</span>
                {p.is_live ? <span className="pl-oshi-rail__live">LIVE</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
