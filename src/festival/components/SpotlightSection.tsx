import type { CSSProperties } from 'react'
import type { Performer } from '../types'
import { initials } from '../lib/initials'

type SpotlightSectionProps = {
  performers: Performer[]
  onOpenPerformer?: (id: string) => void
}

export function SpotlightSection({ performers, onOpenPerformer }: SpotlightSectionProps) {
  return (
    <section className="fe-spotlight" aria-labelledby="fe-spotlight-heading">
      <div className="fe-spotlight__head">
        <h2 id="fe-spotlight-heading" className="fe-section-title">
          <span className="fe-section-title__eyebrow">Editorial pick</span>
          <span className="fe-section-title__main">注目パフォーマー</span>
        </h2>
        <p className="fe-section-title__sub">Spotlight · curated for the main feed</p>
      </div>

      <div className="fe-spotlight__rail" role="list">
        {performers.map((p, i) => (
          <article
            key={p.id}
            className="fe-spot-card"
            role="listitem"
            style={{ '--fe-delay': `${i * 70}ms` } as CSSProperties}
          >
            <button
              type="button"
              className="fe-spot-card__hit"
              onClick={() => onOpenPerformer?.(p.id)}
              disabled={!onOpenPerformer}
            >
              <div className="fe-spot-card__halo" aria-hidden="true" />
              <div
                className={`fe-spot-card__poster${p.photoUrl ? ' fe-spot-card__poster--photo' : ''}`}
                style={
                  p.photoUrl
                    ? { backgroundImage: `url(${p.photoUrl})` }
                    : { background: p.gradient }
                }
              >
                {!p.photoUrl ? <span className="fe-spot-card__initials">{initials(p.name)}</span> : null}
                <span className="fe-spot-card__shine" aria-hidden="true" />
              </div>
              <div className="fe-spot-card__body">
                <p className="fe-spot-card__eyebrow">HEADLINER ENERGY</p>
                <h3 className="fe-spot-card__name">{p.name}</h3>
                <p className="fe-spot-card__name-ja">{p.nameJa}</p>
                <p className="fe-spot-card__act">{p.act}</p>
                <p className="fe-spot-card__tagline">{p.tagline}</p>
              </div>
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
