import { useEffect, useMemo, useRef, useState } from 'react'
import type { Performer, ProgramPulse } from '../../types'
import { initials } from '../../lib/initials'
import { getDemoNow } from '../../lib/demoClock'
import { currentLiveSlot, currentNextSlot, derivedAudienceTimeStatus, slotAsDate, slotEndAsDate } from '../../lib/scheduleEngine'

type HomePrimeSpotlightProps = {
  live: ProgramPulse | null
  next: ProgramPulse | null
  livePerformer?: Performer
  nextPerformer?: Performer
  pickPerformers: readonly Performer[]
  onOpenDetail: (id: string) => void
  onOpenMap: () => void
  onNearShows: () => void
}

function formatHm(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function countdownToStart(start: Date, now: Date): string {
  const ms = start.getTime() - now.getTime()
  if (ms <= 0) return 'まもなく'
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (m >= 120) return `あと約 ${Math.floor(m / 60)} 時間`
  if (m >= 1) return `あと ${m} 分 ${s} 秒`
  return `あと ${s} 秒`
}

function remainingToEnd(end: Date, now: Date): string {
  const ms = end.getTime() - now.getTime()
  if (ms <= 0) return '終了間近'
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (m >= 1) return `残り約 ${m} 分`
  return `残り ${s} 秒`
}

export function HomePrimeSpotlight({
  live,
  next,
  livePerformer,
  nextPerformer,
  pickPerformers,
  onOpenDetail,
  onOpenMap,
  onNearShows,
}: HomePrimeSpotlightProps) {
  const demoEpoch = useMemo(() => getDemoNow().getTime(), [])
  const t0Ref = useRef<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    t0Ref.current = performance.now()
    const id = window.setInterval(() => {
      const t0 = t0Ref.current ?? performance.now()
      setElapsedMs(performance.now() - t0)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const now = useMemo(() => new Date(demoEpoch + elapsedMs), [demoEpoch, elapsedMs])
  const liveSlot = currentLiveSlot()
  const nextSlot = currentNextSlot()

  const liveEnd = useMemo(() => (liveSlot ? slotEndAsDate(liveSlot) : null), [liveSlot])
  const nextStart = useMemo(() => (nextSlot ? slotAsDate(nextSlot) : null), [nextSlot])

  const liveOn = liveSlot ? derivedAudienceTimeStatus(liveSlot, now) === 'live_now' : false
  const hasLive = Boolean(live && livePerformer && liveSlot && liveEnd && liveOn)
  const hasNext = Boolean(
    next && nextPerformer && nextSlot && nextStart && nextStart.getTime() > now.getTime(),
  )

  return (
    <section className="fe-hprime" aria-label="今見るべきショー">
      <div className="fe-hprime__grid">
        <article className={`fe-hprime__now${hasLive ? ' fe-hprime__now--on' : ''}`}>
          <p className="fe-hprime__eyebrow" lang="en">
            NOW PLAYING
          </p>
          {hasLive && live && livePerformer && liveSlot && liveEnd ? (
            <button type="button" className="fe-hprime__body" onClick={() => onOpenDetail(livePerformer.id)}>
              <div
                className={`fe-hprime__av${livePerformer.photoUrl ? ' fe-hprime__av--photo' : ''}`}
                style={
                  livePerformer.photoUrl
                    ? { backgroundImage: `url(${livePerformer.photoUrl})` }
                    : { background: livePerformer.gradient }
                }
              >
                {!livePerformer.photoUrl ? <span>{initials(livePerformer.name)}</span> : null}
              </div>
              <div className="fe-hprime__text">
                <h2 className="fe-hprime__name">{livePerformer.nameJa}</h2>
                <p className="fe-hprime__stage">{live.stageJa}</p>
                <p className="fe-hprime__meta">
                  終了 {formatHm(liveEnd)} · {remainingToEnd(liveEnd, now)}
                </p>
              </div>
            </button>
          ) : (
            <div className="fe-hprime__empty">
              <p className="fe-hprime__empty-k">OFF AIR</p>
              <p className="fe-hprime__empty-t">次のライブが始まるとここが点灯します</p>
            </div>
          )}
        </article>

        <article className="fe-hprime__next">
          <p className="fe-hprime__eyebrow fe-hprime__eyebrow--amber" lang="en">
            NEXT UP
          </p>
          {hasNext && next && nextPerformer && nextSlot && nextStart ? (
            <button type="button" className="fe-hprime__body" onClick={() => onOpenDetail(nextPerformer.id)}>
              <div
                className={`fe-hprime__av fe-hprime__av--sm${nextPerformer.photoUrl ? ' fe-hprime__av--photo' : ''}`}
                style={
                  nextPerformer.photoUrl
                    ? { backgroundImage: `url(${nextPerformer.photoUrl})` }
                    : { background: nextPerformer.gradient }
                }
              >
                {!nextPerformer.photoUrl ? <span>{initials(nextPerformer.name)}</span> : null}
              </div>
              <div className="fe-hprime__text">
                <h2 className="fe-hprime__name fe-hprime__name--sm">{nextPerformer.nameJa}</h2>
                <p className="fe-hprime__stage">{next.stageJa}</p>
                <p className="fe-hprime__genre">{nextPerformer.genre ?? nextPerformer.actJa}</p>
                <p className="fe-hprime__countdown">{countdownToStart(nextStart, now)}</p>
              </div>
            </button>
          ) : (
            <div className="fe-hprime__empty">
              <p className="fe-hprime__empty-k">SCHEDULE</p>
              <p className="fe-hprime__empty-t">次枠はタイムテーブルで確認できます</p>
            </div>
          )}
        </article>
      </div>

      <div className="fe-hprime__picks">
        <p className="fe-hprime__picks-k" lang="en">
          PICKS
        </p>
        <p className="fe-hprime__picks-ja">今日のおすすめ</p>
        <div className="fe-hprime__picks-row">
          {pickPerformers.slice(0, 3).map((p) => (
            <button key={p.id} type="button" className="fe-hprime__pick" onClick={() => onOpenDetail(p.id)}>
              <span
                className={`fe-hprime__pick-dot${p.photoUrl ? ' fe-hprime__pick-dot--photo' : ''}`}
                style={
                  p.photoUrl
                    ? { backgroundImage: `url(${p.photoUrl})` }
                    : { background: p.gradient }
                }
              />
              <span className="fe-hprime__pick-name">{p.nameJa}</span>
              <span className="fe-hprime__pick-sub">{p.genre ?? p.actJa}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="fe-hprime__maprow">
        <button type="button" className="fe-hprime__mapbtn fe-hprime__mapbtn--primary" onClick={onNearShows}>
          近くのショーを探す
        </button>
        <button type="button" className="fe-hprime__mapbtn fe-hprime__mapbtn--ghost" onClick={onOpenMap}>
          会場マップを見る
        </button>
      </div>
    </section>
  )
}
