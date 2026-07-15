import {
  audienceStatusLabelJa,
  statusLabelJa,
  venueById,
  type AudienceTimeStatus,
} from '../../../lib/scheduleEngine'
import type { Performer, ScheduleSlot } from '../../../types'

type TimetableSlotCardProps = {
  slot: ScheduleSlot
  performer?: Performer
  aud: AudienceTimeStatus
  isLive: boolean
  isNext: boolean
  isFavorite: boolean
  rainMode: boolean
  onOpenDetail: (performerId: string) => void
  onToggleFavorite: (performerId: string) => void
}

export function TimetableSlotCard({
  slot,
  performer,
  aud,
  isLive,
  isNext,
  isFavorite,
  rainMode,
  onOpenDetail,
  onToggleFavorite,
}: TimetableSlotCardProps) {
  const venue = venueById(slot.venueId)
  const finished = aud === 'finished'
  const cancelled = aud === 'cancelled' || slot.status === 'cancelled'
  const genre = performer?.genre ?? performer?.actJa ?? '—'
  const venueName = venue?.nameJa ?? slot.stageJa

  const rowClass = [
    'fe-ttv-card',
    finished ? 'fe-ttv-card--done' : '',
    cancelled ? 'fe-ttv-card--cancel' : '',
    isLive ? 'fe-ttv-card--live' : '',
    isNext ? 'fe-ttv-card--next' : '',
    rainMode ? 'fe-ttv-card--rainctx' : '',
    slot.status === 'indoor_moved' ? 'fe-ttv-card--moved' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={rowClass}>
      <div className="fe-ttv-card__time" aria-hidden="true">
        <span className="fe-ttv-card__start">{slot.start}</span>
        <span className="fe-ttv-card__end">{slot.end}</span>
      </div>

      <div className="fe-ttv-card__main">
        <button
          type="button"
          className="fe-ttv-card__hit"
          onClick={() => onOpenDetail(slot.performerId)}
        >
          <div className="fe-ttv-card__head">
            <h2 className="fe-ttv-card__name">{performer?.nameJa ?? slot.performerId}</h2>
            {isLive ? <span className="fe-ttv-card__badge fe-ttv-card__badge--live">LIVE</span> : null}
            {isNext ? <span className="fe-ttv-card__badge fe-ttv-card__badge--next">NEXT</span> : null}
          </div>
          <p className="fe-ttv-card__genre">{genre}</p>
          <p className="fe-ttv-card__venue">{venueName}</p>
          <p className="fe-ttv-card__window">
            {slot.start} – {slot.end}
          </p>
          <p className="fe-ttv-card__status">
            <span className={`fe-tt-aud fe-tt-aud--${aud}`}>{audienceStatusLabelJa(aud)}</span>
            <span className={`fe-tt-status fe-tt-status--${slot.status}`}>{statusLabelJa(slot.status)}</span>
          </p>
          {slot.noteJa ? <p className="fe-ttv-card__note">{slot.noteJa}</p> : null}
        </button>

        <div className="fe-ttv-card__actions">
          <button
            type="button"
            className={`fe-ttv-card__fav${isFavorite ? ' fe-ttv-card__fav--on' : ''}`}
            aria-label={isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
            aria-pressed={isFavorite}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(slot.performerId)
            }}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          <button
            type="button"
            className="fe-ttv-card__detail"
            onClick={() => onOpenDetail(slot.performerId)}
          >
            詳細
          </button>
        </div>
      </div>
    </li>
  )
}
