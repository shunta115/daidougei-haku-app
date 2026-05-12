import type { CSSProperties } from 'react'
import type { Performer } from '../types'
import { initials } from '../lib/initials'
import { formatCompact } from '../lib/format'
import { sharePerformer } from '../lib/share'

type PerformerSocialCardProps = {
  performer: Performer
  index: number
  /** 来場者モードの Acts でお気に入りトグルを有効化 */
  favoritesEnabled?: boolean
  favorite?: boolean
  onToggleFavorite?: () => void
  /** カード本文タップで詳細（ハート・クイックレールは除外） */
  onOpenDetail?: (performer: Performer) => void
  onQuickGo?: (performer: Performer) => void
  onQuickMap?: (performer: Performer) => void
  onQuickTips?: (performer: Performer) => void
}

export function PerformerSocialCard({
  performer: p,
  index,
  favoritesEnabled,
  favorite,
  onToggleFavorite,
  onOpenDetail,
  onQuickGo,
  onQuickMap,
  onQuickTips,
}: PerformerSocialCardProps) {
  const hasQuick = onQuickGo || onQuickMap || onQuickTips

  return (
    <article
      className={`fe-pcard${onOpenDetail ? ' fe-pcard--interactive' : ''}`}
      tabIndex={onOpenDetail ? 0 : undefined}
      style={{ '--fe-stagger': `${index * 55}ms` } as CSSProperties}
      onKeyDown={(e) => {
        if (!onOpenDetail) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail(p)
        }
      }}
    >
      <div className="fe-pcard__inner">
        <div
          className="fe-pcard__body"
          role={onOpenDetail ? 'button' : undefined}
          tabIndex={-1}
          onClick={() => onOpenDetail?.(p)}
        >
          <div
            className={`fe-pcard__media${p.photoUrl ? ' fe-pcard__media--photo' : ''}`}
            style={
              p.photoUrl
                ? { backgroundImage: `linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.75)), url(${p.photoUrl})` }
                : { background: p.gradient }
            }
          >
            {!p.photoUrl ? <span className="fe-pcard__mono">{initials(p.name)}</span> : null}
            <span className="fe-pcard__glint" aria-hidden="true" />
          </div>

          <div className="fe-pcard__content">
            <header className="fe-pcard__head">
              <div>
                <h3 className="fe-pcard__name">{p.name}</h3>
                <p className="fe-pcard__name-ja">{p.nameJa}</p>
              </div>
              {favoritesEnabled && onToggleFavorite ? (
                <button
                  type="button"
                  className={`fe-pcard__heart${favorite ? ' fe-pcard__heart--on' : ''}`}
                  aria-pressed={favorite}
                  aria-label={favorite ? `${p.name} をお気に入りから外す` : `${p.name} をお気に入りに追加`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite()
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      fill={favorite ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : (
                <button type="button" className="fe-pcard__save" aria-label="Save (demo)" disabled title="Demo">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M7 3h10a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </header>

            <div className="fe-pcard__tags">
              <span className="fe-chip fe-chip--neon">{p.act}</span>
              <span className="fe-chip fe-chip--gold">{p.locale}</span>
              {p.genre ? (
                <span className="fe-chip fe-chip--ghost">{p.genre}</span>
              ) : (
                <span className="fe-chip fe-chip--ghost">{p.actJa}</span>
              )}
            </div>

            <p className="fe-pcard__quote">{p.tagline}</p>

            <footer className="fe-pcard__foot">
              <span className="fe-pcard__stat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 21s-7-4.35-7-10a7 7 0 1 1 14 0c0 5.65-7 10-7 10Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                {formatCompact(p.likes)}
              </span>
              <span className="fe-pcard__stat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 12v8a1 1 0 0 0 1 1h5v-7H4Zm16 0h-6v7h5a1 1 0 0 0 1-1v-8ZM15 3H9L4 9h16L15 3Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                {formatCompact(p.saves)}
              </span>
              <span className="fe-pcard__heat">
                <span className="fe-pcard__heat-label">HEAT</span>
                <span className="fe-pcard__heat-value">{p.heat}</span>
              </span>
            </footer>
          </div>
        </div>

        {hasQuick ? (
          <div className="fe-pcard__rail" onClick={(e) => e.stopPropagation()}>
            {onQuickGo ? (
              <button type="button" className="fe-pcard__q" onClick={() => onQuickGo(p)}>
                今すぐ
              </button>
            ) : null}
            {onQuickMap ? (
              <button type="button" className="fe-pcard__q" onClick={() => onQuickMap(p)}>
                地図
              </button>
            ) : null}
            {onQuickTips ? (
              <button type="button" className="fe-pcard__q" onClick={() => onQuickTips(p)}>
                投げ銭
              </button>
            ) : null}
            <button type="button" className="fe-pcard__q" onClick={() => void sharePerformer(p)}>
              シェア
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}
