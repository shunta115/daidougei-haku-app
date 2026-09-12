import { useEffect, useState } from 'react'
import type { Performer } from '../../types'
import { initials } from '../../lib/initials'
import { readFavorites } from '../../lib/favoritesStorage'
import { getDemoNow } from '../../lib/demoClock'
import { demoTodayDateString, nextSlotForPerformerFromNow, slotEndAsDate, todaySlotsForPerformer } from '../../lib/scheduleEngine'
import { canWatchLiveStream } from '../../lib/productionGuard'
import { shouldShowAsLiveStream } from '../../lib/streamPresence'
import { useAuth } from '../../../platform/lib/auth'
import { isSupabaseConfigured } from '../../../platform/lib/supabase'
import { listOshiPerformers } from '../../../platform/lib/api'
import { platformToFestival } from '../../../catalog/liveCatalog'
import { toggleOshiOrLogin } from '../../lib/oshiActions'
import { openPlatform } from '../../../app/routes'
import { useLang } from '../../../i18n/LangProvider'

type OshiListScreenProps = {
  performers: Performer[]
  favTick: number
  onFavoritesChange: () => void
  onOpenPerformer?: (id: string) => void
  onWatchStream?: (id: string) => void
  onSupportStream?: (id: string) => void
  onBetaSupport?: () => void
}

function isStreamReady(p: Performer) {
  return p.approvalStatus === 'approved' && p.canStream
}

function isLiveNow(p: Performer) {
  return shouldShowAsLiveStream(p)
}

function nextLineForPerformer(p: Performer): string {
  if (isLiveNow(p)) return p.streamTitle ? `LIVE · ${p.streamTitle}` : 'ライブ配信中'
  if (isStreamReady(p)) return p.streamTitle ? `近日配信 · ${p.streamTitle}` : '配信可能 · 次のLIVEをお待ちください'
  const now = getDemoNow()
  const next = nextSlotForPerformerFromNow(p.id, now)
  if (next) return `NEXT · ${next.start}–${next.end} · ${next.stageJa}`
  const today = demoTodayDateString()
  const day = todaySlotsForPerformer(p.id, today)
  if (!day.length) return 'スケジュールは後日公開'
  const last = day[day.length - 1]!
  if (slotEndAsDate(last) < now) return '本日の回は終了 · また明日'
  return `本日 · ${day[0]!.start} から · ${day[0]!.stageJa}`
}

function sortOshi(a: Performer, b: Performer) {
  const rank = (p: Performer) => (isLiveNow(p) ? 0 : isStreamReady(p) ? 1 : 2)
  return rank(a) - rank(b) || b.heat - a.heat
}

export function OshiListScreen({
  performers,
  favTick,
  onFavoritesChange,
  onOpenPerformer,
  onWatchStream,
  onSupportStream,
  onBetaSupport,
}: OshiListScreenProps) {
  const { user } = useAuth()
  const { lang } = useLang()
  const [remote, setRemote] = useState<Performer[]>([])

  useEffect(() => {
    if (!user || !isSupabaseConfigured) {
      setRemote([])
      return
    }
    let cancelled = false
    void listOshiPerformers(user.id)
      .then((rows) => {
        if (!cancelled) setRemote(rows.map(platformToFestival))
      })
      .catch(() => {
        if (!cancelled) setRemote([])
      })
    return () => {
      cancelled = true
    }
  }, [user, favTick])

  const ids = readFavorites()
  const fromCatalog = performers.filter((p) => ids.includes(p.id))
  const merged = [...remote, ...fromCatalog.filter((p) => !remote.some((r) => r.id === p.id))]
  const saved = merged.sort(sortOshi)
  const liveOshi = saved.filter(isLiveNow)

  return (
    <main className="fe-main fe-main--sub fe-main--oshi" data-fav-tick={favTick}>
      <header className="fe-page-head">
        <p className="fe-page-head__eyebrow">推し</p>
        <h1 className="fe-page-head__title">推しリスト</h1>
        <p className="fe-page-head__lead">
          推しの配信がいちばん上。視聴は無料。応援・投げ銭はアカウントから。
        </p>
      </header>

      {liveOshi.length > 0 ? (
        <section className="fe-oshi-live-banner" aria-label="推しが配信中">
          <p className="fe-oshi-live-banner__k">
            {lang === 'ja' ? '推しがLIVE中' : 'Your oshi is live'}
          </p>
          <p className="fe-oshi-live-banner__t">
            推しがいま配信中 · {liveOshi.map((p) => p.nameJa).join(' / ')}
          </p>
          {onWatchStream ? (
            <div className="fe-oshi-live-banner__actions">
              {liveOshi.map((p) => {
                const watchable = canWatchLiveStream(p)
                return (
                <button
                  key={p.id}
                  type="button"
                  className="fe-oshi-live-banner__btn"
                  disabled={!watchable}
                  onClick={() => watchable && onWatchStream(p.id)}
                >
                  {watchable ? `${p.nameJa} を見る` : `${p.nameJa} · 配信準備中`}
                </button>
                )
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="fe-lib-block" aria-labelledby="fe-oshi-h">
        <h2 id="fe-oshi-h" className="fe-lib-h">
          推し演者
        </h2>
        {saved.length === 0 ? (
          <p className="fe-lib-empty">
            {user
              ? 'まだいません。出演者のプロフィールから推しに登録してください。'
              : 'ログインすると推しを保存できます。'}
            {!user ? (
              <>
                {' '}
                <button type="button" className="fe-btn fe-btn--primary fe-btn--compact" onClick={() => openPlatform('?auth=1')}>
                  ログイン
                </button>
              </>
            ) : null}
          </p>
        ) : (
          <ul className="fe-oshi-list">
            {saved.map((p) => {
              const live = isLiveNow(p)
              const ready = isStreamReady(p)
              const watchable = canWatchLiveStream(p)
              return (
                <li key={p.id} className={`fe-oshi-card${live ? ' fe-oshi-card--live' : ''}`}>
                  <button
                    type="button"
                    className="fe-oshi-card__main"
                    onClick={() => onOpenPerformer?.(p.id)}
                    disabled={!onOpenPerformer}
                  >
                    <div className="fe-oshi-card__av-wrap">
                      <div className="fe-oshi-card__av" style={{ background: p.gradient }}>
                        <span>{initials(p.name)}</span>
                      </div>
                      {live ? (
                        <span className="fe-oshi-card__live" lang="en">
                          LIVE
                        </span>
                      ) : null}
                    </div>
                    <div className="fe-oshi-card__body">
                      <p className="fe-oshi-card__name">{p.nameJa}</p>
                      <p className="fe-oshi-card__meta">
                        {p.country}
                        {p.genre ? ` · ${p.genre}` : ''}
                      </p>
                      <p className="fe-oshi-card__next">{nextLineForPerformer(p)}</p>
                    </div>
                  </button>
                  <div className="fe-oshi-card__side">
                    {live && onWatchStream && onSupportStream ? (
                      <div className="fe-oshi-card__stream">
                        <button
                          type="button"
                          className="fe-oshi-card__watch"
                          disabled={!watchable}
                          onClick={() => watchable && onWatchStream(p.id)}
                        >
                          {watchable ? '視聴' : '準備中'}
                        </button>
                        <button type="button" className="fe-oshi-card__support" onClick={() => onSupportStream(p.id)}>
                          応援
                        </button>
                      </div>
                    ) : ready && onWatchStream ? (
                      <button
                        type="button"
                        className="fe-oshi-card__open"
                        disabled={!watchable}
                        onClick={() => watchable && onWatchStream(p.id)}
                      >
                        {watchable ? '配信ページ' : '配信準備中'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="fe-oshi-card__out"
                      onClick={() => {
                        void toggleOshiOrLogin(user?.id, p.id).then((result) => {
                          if (result !== 'login') onFavoritesChange()
                        })
                      }}
                      aria-label={`${p.nameJa} を推しから外す`}
                    >
                      解除
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="fe-lib-block" aria-labelledby="fe-oshi-tip-h">
        <h2 id="fe-oshi-tip-h" className="fe-lib-h">
          WEB完結投げ銭
        </h2>
        <p className="fe-lib-tip">投げ銭はログイン後、LIVEから安全な決済ページで完了します。</p>
        {saved.length === 0 ? (
          <p className="fe-lib-empty">推しを追加するとリンクが並びます。</p>
        ) : (
          <ul className="fe-lib-tip-list">
            {saved.map((p) => (
                <li key={p.id} className="fe-lib-tip-card">
                  <p className="fe-lib-tip-card__name">{p.nameJa}</p>
                  <div className="fe-lib-tip-card__links">
                    {isLiveNow(p) && onSupportStream ? (
                      <button type="button" className="fe-btn fe-btn--primary fe-btn--compact" onClick={() => onSupportStream(p.id)}>
                        配信で応援
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="fe-btn fe-btn--glass fe-btn--compact"
                      onClick={() => {
                        if (onSupportStream) {
                          onSupportStream(p.id)
                          return
                        }
                        onBetaSupport?.()
                      }}
                    >
                      WEB投げ銭
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </main>
  )
}
