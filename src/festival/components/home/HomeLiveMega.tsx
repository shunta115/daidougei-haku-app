import { useEffect, useMemo, useRef, useState } from 'react'
import type { Performer, ProgramPulse } from '../../types'
import { initials } from '../../lib/initials'
import { getDemoNow } from '../../lib/demoClock'
import {
  currentLiveSlot,
  currentNextSlot,
  derivedAudienceTimeStatus,
  slotAsDate,
  slotEndAsDate,
} from '../../lib/scheduleEngine'
import { useLang } from '../../../i18n/LangProvider'

type HomeLiveMegaProps = {
  live: ProgramPulse | null
  next: ProgramPulse | null
  livePerformer?: Performer
  nextPerformer?: Performer
  onOpenDetail: (id: string) => void
  onOpenMap: () => void
}

function formatHm(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function remainingToEnd(end: Date, now: Date): string {
  const ms = end.getTime() - now.getTime()
  if (ms <= 0) return '終了間近'
  const m = Math.floor(ms / 60_000)
  return m >= 1 ? `残り約 ${m} 分` : `残り ${Math.floor((ms % 60_000) / 1000)} 秒`
}

export function HomeLiveMega({ live, next, livePerformer, nextPerformer, onOpenDetail, onOpenMap }: HomeLiveMegaProps) {
  const { t } = useLang()
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
  const liveEnd = liveSlot ? slotEndAsDate(liveSlot) : null
  const nextStart = nextSlot ? slotAsDate(nextSlot) : null
  const liveOn = liveSlot ? derivedAudienceTimeStatus(liveSlot, now) === 'live_now' : false
  const hasLive = Boolean(live && livePerformer && liveSlot && liveEnd && liveOn)

  return (
    <section className={`fe-h6-live${hasLive ? ' fe-h6-live--on' : ''}`} aria-label="ライブ配信中">
      <div className="fe-h6-live__head">
        <span className="fe-h6-live__tag" lang="en">
          LIVE NOW
        </span>
        <span className="fe-h6-live__pulse" aria-hidden="true" />
        {hasLive && live ? (
          <p className="fe-h6-live__where">{live.stageJa}</p>
        ) : (
          <p className="fe-h6-live__where">{t('noLiveNow')}</p>
        )}
      </div>

      {hasLive && livePerformer && liveEnd ? (
        <button type="button" className="fe-h6-live__card" onClick={() => onOpenDetail(livePerformer.id)}>
          <div
            className={`fe-h6-live__photo${livePerformer.photoUrl ? ' fe-h6-live__photo--img' : ''}`}
            style={
              livePerformer.photoUrl
                ? { backgroundImage: `url(${livePerformer.photoUrl})` }
                : { background: livePerformer.gradient }
            }
          >
            {!livePerformer.photoUrl ? <span>{initials(livePerformer.name)}</span> : null}
            <span className="fe-h6-live__livepill">ON AIR</span>
          </div>
          <div className="fe-h6-live__info">
            <p className="fe-h6-live__genre">{livePerformer.genre ?? livePerformer.actJa}</p>
            <h2 className="fe-h6-live__name">{livePerformer.nameJa}</h2>
            <p className="fe-h6-live__meta">
              終了 {formatHm(liveEnd)} · {remainingToEnd(liveEnd, now)}
            </p>
          </div>
        </button>
      ) : next && nextPerformer && nextStart ? (
        <button type="button" className="fe-h6-live__card fe-h6-live__card--next" onClick={() => onOpenDetail(nextPerformer.id)}>
          <p className="fe-h6-live__nextk">NEXT UP</p>
          <h2 className="fe-h6-live__name">{nextPerformer.nameJa}</h2>
          <p className="fe-h6-live__meta">
            {next.stageJa} · {nextSlot?.start} 開始予定
          </p>
        </button>
      ) : null}

      <button type="button" className="fe-h6-live__map" onClick={onOpenMap}>
        {t('openMapConfirm')}
      </button>
    </section>
  )
}
