import { performerById } from '../../data'
import { currentLiveSlot, currentNextSlot } from '../../lib/scheduleEngine'

export function TimetableLiveNextBar() {
  const live = currentLiveSlot()
  const next = currentNextSlot()
  const liveP = live ? performerById(live.performerId) : undefined
  const nextP = next ? performerById(next.performerId) : undefined

  if (!live && !next) return null

  return (
    <div className="fe-tt-pulsebar" aria-label="今開催中と次演目">
      {live ? (
        <div className="fe-tt-pulsebar__cell fe-tt-pulsebar__cell--live">
          <span className="fe-tt-pulsebar__tag">LIVE NOW</span>
          <p className="fe-tt-pulsebar__name">{liveP?.nameJa ?? live.performerId}</p>
          <p className="fe-tt-pulsebar__meta">
            {live.stageJa} · {live.start}–{live.end}
          </p>
        </div>
      ) : null}
      {next ? (
        <div className="fe-tt-pulsebar__cell fe-tt-pulsebar__cell--next">
          <span className="fe-tt-pulsebar__tag fe-tt-pulsebar__tag--next">NEXT SHOW</span>
          <p className="fe-tt-pulsebar__name">{nextP?.nameJa ?? next.performerId}</p>
          <p className="fe-tt-pulsebar__meta">
            {next.stageJa} · {next.start}–{next.end}
          </p>
        </div>
      ) : null}
    </div>
  )
}
