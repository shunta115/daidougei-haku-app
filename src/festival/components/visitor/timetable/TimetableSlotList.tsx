import type { AudienceTimeStatus } from '../../../lib/scheduleEngine'
import type { Performer, ScheduleSlot } from '../../../types'
import { TimetableSlotCard } from './TimetableSlotCard'

export type TimetableRow = {
  slot: ScheduleSlot
  performer?: Performer
  aud: AudienceTimeStatus
}

type TimetableSlotListProps = {
  rows: TimetableRow[]
  nextSlotId: string | null
  favIds: string[]
  rainMode: boolean
  onOpenDetail: (performerId: string) => void
  onToggleFavorite: (performerId: string) => void
}

export function TimetableSlotList({
  rows,
  nextSlotId,
  favIds,
  rainMode,
  onOpenDetail,
  onToggleFavorite,
}: TimetableSlotListProps) {
  return (
    <div className="fe-ttv-listwrap">
      <div className="fe-ttv-listhead">
        <span className="fe-ttv-listhead__k">時間順</span>
        <span className="fe-ttv-listhead__n">{rows.length} 演目</span>
      </div>
      <ul className="fe-ttv-list">
        {rows.length === 0 ? (
          <li className="fe-ttv-list__empty">
            <p className="fe-ttv-list__empty-k">該当なし</p>
            <p className="fe-ttv-list__empty-t">会場・ジャンル・雨天モードの条件を変えてみてください</p>
          </li>
        ) : null}
        {rows.map(({ slot, performer, aud }) => {
          const isLive = aud === 'live_now' || slot.status === 'live'
          const isNext = slot.id === nextSlotId || slot.status === 'next'
          return (
            <TimetableSlotCard
              key={slot.id}
              slot={slot}
              performer={performer}
              aud={aud}
              isLive={isLive}
              isNext={isNext && !isLive}
              isFavorite={favIds.includes(slot.performerId)}
              rainMode={rainMode}
              onOpenDetail={onOpenDetail}
              onToggleFavorite={onToggleFavorite}
            />
          )
        })}
      </ul>
    </div>
  )
}
