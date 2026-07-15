import type { Performer } from '../../../types'
import { initials } from '../../../lib/initials'
import { formatPerformerScheduleSummary } from '../../../lib/performerScheduleLabel'

type PerformerListCardProps = {
  performer: Performer
  isFavorite: boolean
  onOpenDetail: (id: string) => void
  onToggleFavorite: (id: string) => void
  onWatchStream?: (id: string) => void
  onSupportStream?: (id: string) => void
}

export function PerformerListCard({
  performer: p,
  isFavorite,
  onOpenDetail,
  onToggleFavorite,
  onWatchStream,
  onSupportStream,
}: PerformerListCardProps) {
  const schedule = formatPerformerScheduleSummary(p.id)
  const genre = p.genre ?? p.actJa
  const streamReady = p.approvalStatus === 'approved' && p.canStream
  const isLive = streamReady && p.isLive

  return (
    <article className={`fe-plist-card${isLive ? ' fe-plist-card--live' : ''}`}>
      <button type="button" className="fe-plist-card__media" onClick={() => onOpenDetail(p.id)}>
        <span
          className={`fe-plist-card__photo${p.photoUrl ? ' fe-plist-card__photo--img' : ''}`}
          style={
            p.photoUrl
              ? { backgroundImage: `url(${p.photoUrl})` }
              : { background: p.gradient }
          }
        >
          {!p.photoUrl ? <span className="fe-plist-card__mono">{initials(p.name)}</span> : null}
        </span>
        {isLive ? (
          <span className="fe-plist-card__live-badge" lang="en">
            LIVE
          </span>
        ) : null}
      </button>

      <div className="fe-plist-card__body">
        <button type="button" className="fe-plist-card__hit" onClick={() => onOpenDetail(p.id)}>
          <p className="fe-plist-card__genre">
            {genre}
            {p.country ? <span className="fe-plist-card__country"> · {p.country}</span> : null}
          </p>
          <h2 className="fe-plist-card__name">{p.nameJa}</h2>
          <p className="fe-plist-card__name-en" lang="en">
            {p.name}
          </p>
          <p className="fe-plist-card__tagline">{isLive && p.streamTitle ? p.streamTitle : p.tagline}</p>
          <p className="fe-plist-card__schedule">{isLive ? '配信ステータス · LIVE' : schedule}</p>
        </button>

        {isLive && onWatchStream && onSupportStream ? (
          <div className="fe-plist-card__stream">
            <button type="button" className="fe-plist-card__watch" onClick={() => onWatchStream(p.id)}>
              視聴する
            </button>
            <button type="button" className="fe-plist-card__support" onClick={() => onSupportStream(p.id)}>
              応援する
            </button>
          </div>
        ) : null}

        <div className="fe-plist-card__actions">
          <button
            type="button"
            className={`fe-plist-card__fav${isFavorite ? ' fe-plist-card__fav--on' : ''}`}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
            onClick={() => onToggleFavorite(p.id)}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          <button type="button" className="fe-plist-card__detail" onClick={() => onOpenDetail(p.id)}>
            詳細
          </button>
        </div>
      </div>
    </article>
  )
}
