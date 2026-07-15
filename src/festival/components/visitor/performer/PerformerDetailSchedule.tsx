import type { Performer, ScheduleSlot } from '../../../types'
import { statusLabelJa } from '../../../lib/scheduleEngine'

type PerformerDetailScheduleProps = {
  performer: Performer
  todaySlots: ScheduleSlot[]
  allSlots: ScheduleSlot[]
  onOpenTimetable: () => void
}

export function PerformerDetailSchedule({
  todaySlots,
  allSlots,
  onOpenTimetable,
}: PerformerDetailScheduleProps) {
  return (
    <>
      <section className="fe-detail-block" aria-labelledby="fe-d-today">
        <h2 id="fe-d-today" className="fe-detail-h">
          今日の出演
        </h2>
        {todaySlots.length ? (
          <ul className="fe-detail-sch">
            {todaySlots.map((slot) => (
              <li key={slot.id} className="fe-detail-sch__row">
                <span className="fe-detail-sch__date">
                  {slot.start}–{slot.end}
                </span>
                <span className="fe-detail-sch__venue">{slot.stageJa}</span>
                <span className={`fe-detail-status fe-detail-status--${slot.status}`}>
                  {statusLabelJa(slot.status)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fe-detail-muted">本日の枠なし（デモ日付と照合）</p>
        )}
      </section>

      <section className="fe-detail-block" aria-labelledby="fe-d-sch">
        <div className="fe-detail-block__row">
          <h2 id="fe-d-sch" className="fe-detail-h">
            出演スケジュール
          </h2>
          <button type="button" className="fe-detail-link" onClick={onOpenTimetable}>
            タイムテーブルへ
          </button>
        </div>
        {allSlots.length ? (
          <ul className="fe-detail-sch">
            {allSlots.map((slot) => (
              <li key={slot.id} className="fe-detail-sch__row">
                <span className="fe-detail-sch__date">
                  {slot.date} {slot.start}–{slot.end}
                </span>
                <span className="fe-detail-sch__venue">{slot.stageJa}</span>
                <span className={`fe-detail-status fe-detail-status--${slot.status}`}>
                  {statusLabelJa(slot.status)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fe-detail-muted">スケジュール未設定（デモ）</p>
        )}
      </section>
    </>
  )
}
