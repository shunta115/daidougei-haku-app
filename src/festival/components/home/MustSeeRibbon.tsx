import { useMemo, useState } from 'react'
import type { Performer, ProgramPulse, VenueArea } from '../../types'
import { readAdminOps } from '../../lib/adminOpsStorage'
import { todayBuiltInScheduleAlerts } from '../../lib/scheduleEngine'

type MustSeeRibbonProps = {
  live: ProgramPulse | null
  next: ProgramPulse | null
  livePerformer?: Performer
  nextPerformer?: Performer
  soonPerformer?: Performer
  soonLabel?: string
  hotVenue: VenueArea
  spotlight: Performer | undefined
  onOpen: (id: string) => void
  onOpenMap: () => void
}

export function MustSeeRibbon({
  live,
  next,
  livePerformer,
  nextPerformer,
  soonPerformer,
  soonLabel,
  hotVenue,
  spotlight,
  onOpen,
  onOpenMap,
}: MustSeeRibbonProps) {
  const [rev, setRev] = useState(0)

  const mergedAlerts = useMemo(() => {
    void rev
    const o = readAdminOps()
    const a = [...todayBuiltInScheduleAlerts()]
    if (o.weatherNotes.trim()) a.unshift(o.weatherNotes.trim())
    return a
  }, [rev])

  return (
    <section className="fe-must" aria-label="今見るべきもの">
      <div className="fe-must__head">
        <h2 className="fe-must__title">
          <span className="fe-must__eyebrow" lang="en">
            RIGHT NOW
          </span>
          いま見るべきもの
        </h2>
        <button type="button" className="fe-must__refresh" onClick={() => setRev((n) => n + 1)}>
          更新
        </button>
      </div>

      <div className="fe-must__scroll">
        {soonPerformer ? (
          <button type="button" className="fe-must__chip fe-must__chip--soon" onClick={() => onOpen(soonPerformer.id)}>
            <span className="fe-must__chip-k">まもなく</span>
            <span className="fe-must__chip-n">{soonPerformer.nameJa}</span>
            <span className="fe-must__chip-s">{soonLabel ?? '開演が近い'}</span>
          </button>
        ) : null}

        {live && livePerformer ? (
          <button type="button" className="fe-must__chip fe-must__chip--live" onClick={() => onOpen(livePerformer.id)}>
            <span className="fe-must__chip-k">LIVE</span>
            <span className="fe-must__chip-n">{livePerformer.nameJa}</span>
            <span className="fe-must__chip-s">{live.stageJa}</span>
          </button>
        ) : null}

        {next && nextPerformer ? (
          <button type="button" className="fe-must__chip fe-must__chip--next" onClick={() => onOpen(nextPerformer.id)}>
            <span className="fe-must__chip-k">NEXT</span>
            <span className="fe-must__chip-n">{nextPerformer.nameJa}</span>
            <span className="fe-must__chip-s">{next.stageJa}</span>
          </button>
        ) : null}

        <button type="button" className="fe-must__chip fe-must__chip--venue" onClick={onOpenMap}>
          <span className="fe-must__chip-k">近くのステージ</span>
          <span className="fe-must__chip-n">{hotVenue.nameJa}</span>
          <span className="fe-must__chip-s">マップで熱量を確認</span>
        </button>

        {spotlight ? (
          <button type="button" className="fe-must__chip fe-must__chip--spot" onClick={() => onOpen(spotlight.id)}>
            <span className="fe-must__chip-k">今夜の注目</span>
            <span className="fe-must__chip-n">{spotlight.nameJa}</span>
            <span className="fe-must__chip-s">{spotlight.actJa}</span>
          </button>
        ) : null}
      </div>

      {mergedAlerts.length ? (
        <div className="fe-must__alerts" role="status">
          {mergedAlerts.slice(0, 3).map((line, i) => (
            <p key={`${i}-${line.slice(0, 12)}`} className="fe-must__alert">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}
