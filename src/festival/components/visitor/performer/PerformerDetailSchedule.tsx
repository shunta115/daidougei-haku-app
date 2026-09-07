import type { Performer, ScheduleSlot } from '../../../types'
import { getDemoNow, tokyoWallDate } from '../../../lib/demoClock'
import { statusLabelJa } from '../../../lib/scheduleEngine'
import { isPublicMode } from '../../../config/runtimeConfig'
import { PUBLIC_EVENT_COPY } from '../../../services/festivalRepository'

type PerformerDetailScheduleProps = {
  performer: Performer
  todaySlots: ScheduleSlot[]
  allSlots: ScheduleSlot[]
  onOpenTimetable: () => void
}

function isFinished(slot: ScheduleSlot, now: Date) {
  return tokyoWallDate(slot.date, slot.end) < now
}

export function PerformerDetailSchedule({
  todaySlots,
  allSlots,
  onOpenTimetable,
}: PerformerDetailScheduleProps) {
  const now = getDemoNow()
  const upcoming = allSlots.filter((s) => !isFinished(s, now) && s.status !== 'cancelled')
  const finished = allSlots.filter((s) => isFinished(s, now))
  const cancelled = allSlots.filter((s) => s.status === 'cancelled' || s.status === 'delayed' || s.status === 'indoor_moved')

  if (!todaySlots.length && !upcoming.length && !allSlots.length) {
    return (
      <section className="fe-detail-block" aria-labelledby="fe-d-today">
        <h2 id="fe-d-today" className="fe-detail-h">
          次の出演
        </h2>
        <p className="fe-detail-muted">
          {isPublicMode ? PUBLIC_EVENT_COPY.schedulePending : 'スケジュール未設定'}
        </p>
        <button type="button" className="fe-detail-link" onClick={onOpenTimetable}>
          タイムテーブルへ
        </button>
      </section>
    )
  }

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
                {slot.noteJa ? <span className="fe-detail-sch__note">{slot.noteJa}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="fe-detail-muted">
            {isPublicMode ? PUBLIC_EVENT_COPY.noLiveShows : '本日の枠はありません'}
          </p>
        )}
      </section>

      <section className="fe-detail-block" aria-labelledby="fe-d-upcoming">
        <h2 id="fe-d-upcoming" className="fe-detail-h">
          今後の公演
        </h2>
        {upcoming.length ? (
          <ul className="fe-detail-sch">
            {upcoming.map((slot) => (
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
          <p className="fe-detail-muted">
            {isPublicMode ? PUBLIC_EVENT_COPY.schedulePending : '今後の枠は未登録です'}
          </p>
        )}
      </section>

      {cancelled.length > 0 ? (
        <section className="fe-detail-block" aria-labelledby="fe-d-changes">
          <h2 id="fe-d-changes" className="fe-detail-h">
            中止・変更
          </h2>
          <ul className="fe-detail-sch">
            {cancelled.map((slot) => (
              <li key={slot.id} className="fe-detail-sch__row">
                <span className="fe-detail-sch__date">
                  {slot.date} {slot.start}
                </span>
                <span className="fe-detail-sch__venue">{slot.stageJa}</span>
                <span className={`fe-detail-status fe-detail-status--${slot.status}`}>
                  {statusLabelJa(slot.status)}
                </span>
                {slot.noteJa ? <span className="fe-detail-sch__note">{slot.noteJa}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {finished.length > 0 ? (
        <section className="fe-detail-block" aria-labelledby="fe-d-done">
          <h2 id="fe-d-done" className="fe-detail-h">
            終了済み
          </h2>
          <ul className="fe-detail-sch">
            {finished.map((slot) => (
              <li key={slot.id} className="fe-detail-sch__row fe-detail-sch__row--done">
                <span className="fe-detail-sch__date">
                  {slot.date} {slot.start}–{slot.end}
                </span>
                <span className="fe-detail-sch__venue">{slot.stageJa}</span>
                <span className="fe-detail-status fe-detail-status--scheduled">終了</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="fe-detail-block" aria-labelledby="fe-d-sch">
        <div className="fe-detail-block__row">
          <h2 id="fe-d-sch" className="fe-detail-h">
            全スケジュール
          </h2>
          <button type="button" className="fe-detail-link" onClick={onOpenTimetable}>
            タイムテーブルへ
          </button>
        </div>
        {allSlots.length === 0 ? (
          <p className="fe-detail-muted">
            {isPublicMode ? PUBLIC_EVENT_COPY.schedulePending : 'スケジュール未設定'}
          </p>
        ) : (
          <p className="fe-detail-muted">上記に本日・今後・変更・終了を分類して表示しています。</p>
        )}
      </section>
    </>
  )
}
