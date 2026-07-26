import { useMemo, useState } from 'react'
import type { Performer } from '../../types'
import { getDemoNow } from '../../lib/demoClock'
import { minutesBeforeSlotStart, slotsStartingWithinMinutes } from '../../lib/scheduleEngine'

type SoonStartsStripProps = {
  performers: Performer[]
  onOpenPerformer: (id: string) => void
}

export function SoonStartsStrip({ performers, onOpenPerformer }: SoonStartsStripProps) {
  const [tick, setTick] = useState(0)
  const rows = useMemo(() => {
    void tick
    return slotsStartingWithinMinutes(performers, getDemoNow(), 15)
  }, [performers, tick])

  return (
    <section className="fe-soon" aria-label="まもなく開始">
      <div className="fe-soon__head">
        <div>
          <p className="fe-soon__eyebrow" lang="en">
            SOON
          </p>
          <h2 className="fe-soon__title">まもなく開始</h2>
        </div>
        <button type="button" className="fe-soon__sync" onClick={() => setTick((n) => n + 1)}>
          SYNC
        </button>
      </div>

      <div className="fe-soon__scroll">
        {rows.length === 0 ? (
          <div className="fe-soon__empty">
            <p className="fe-soon__empty-k">COUNTDOWN</p>
            <p className="fe-soon__empty-t">15分以内に開演する演目がここに並びます</p>
          </div>
        ) : (
          rows.map(({ slot, performer }) => {
            const mins = Math.max(1, Math.ceil(minutesBeforeSlotStart(slot, getDemoNow())))
            return (
              <button key={slot.id} type="button" className="fe-soon__card" onClick={() => onOpenPerformer(performer.id)}>
                <span className="fe-soon__tag">まもなく</span>
                <span className="fe-soon__name">{performer.nameJa}</span>
                <span className="fe-soon__meta">
                  {slot.start} · {slot.stageJa}
                </span>
                <span className="fe-soon__eta">あと約 {mins} 分</span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
