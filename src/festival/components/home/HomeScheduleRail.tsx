import { useMemo } from 'react'
import { performerById } from '../../data'
import { getDemoNow } from '../../lib/demoClock'
import type { TimetableScheduleMode } from '../../lib/timetableConstants'
import {
  demoTodayDateString,
  derivedAudienceTimeStatus,
  nextHighlightSlotId,
  sortSlotsChronological,
  slotsByDate,
} from '../../lib/scheduleEngine'
import { PUBLIC_EVENT_COPY } from '../../services/festivalRepository'
import { isPublicMode } from '../../config/runtimeConfig'

type HomeScheduleRailProps = {
  scheduleMode: TimetableScheduleMode
  onOpenDetail: (id: string) => void
  onOpenTimetable: () => void
}

export function HomeScheduleRail({ scheduleMode, onOpenDetail, onOpenTimetable }: HomeScheduleRailProps) {
  const now = getDemoNow()
  const today = demoTodayDateString()
  const nextId = nextHighlightSlotId()
  const rain = scheduleMode === 'rain'

  const rows = useMemo(() => {
    let slots = sortSlotsChronological(slotsByDate(today))
    if (rain) {
      slots = slots.filter(
        (s) =>
          s.status === 'indoor_moved' ||
          s.status === 'delayed' ||
          s.status === 'cancelled' ||
          Boolean(s.noteJa?.includes('雨')),
      )
    }
    return slots.map((slot) => ({
      slot,
      performer: performerById(slot.performerId),
      aud: derivedAudienceTimeStatus(slot, now),
    }))
  }, [today, rain, now])

  return (
    <section className={`fe-h6-rail${rain ? ' fe-h6-rail--rain' : ''}`} aria-label="今日のタイムテーブル">
      <div className="fe-h6-rail__head">
        <h2 className="fe-h6-rail__title">今日の公演</h2>
        <button type="button" className="fe-h6-rail__all" onClick={onOpenTimetable}>
          すべて
        </button>
      </div>
      <div className="fe-h6-rail__scroll" role="list">
        {rows.length === 0 ? (
          <p className="fe-h6-rail__empty">
            {isPublicMode ? PUBLIC_EVENT_COPY.noLiveShows : '該当する公演がありません'}
          </p>
        ) : null}
        {rows.map(({ slot, performer, aud }) => {
          const isLive = aud === 'live_now' || slot.status === 'live'
          const isNext = slot.id === nextId || slot.status === 'next'
          const done = aud === 'finished'
          return (
            <button
              key={slot.id}
              type="button"
              role="listitem"
              className={[
                'fe-h6-rail__card',
                isLive ? 'fe-h6-rail__card--live' : '',
                isNext && !isLive ? 'fe-h6-rail__card--next' : '',
                done ? 'fe-h6-rail__card--done' : '',
                rain ? 'fe-h6-rail__card--rainctx' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onOpenDetail(slot.performerId)}
            >
              <span className="fe-h6-rail__time">{slot.start}</span>
              <span className="fe-h6-rail__name">{performer?.nameJa ?? slot.performerId}</span>
              <span className="fe-h6-rail__stage">{slot.stageJa}</span>
              {isLive ? <span className="fe-h6-rail__badge fe-h6-rail__badge--live">LIVE</span> : null}
              {isNext && !isLive ? <span className="fe-h6-rail__badge fe-h6-rail__badge--next">NEXT</span> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
