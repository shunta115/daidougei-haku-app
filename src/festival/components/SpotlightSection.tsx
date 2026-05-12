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
          <span className="fe-section-title__eyebrow">Spotlight</span>
          <span className="fe-section-title__main">注目パフォーマー</span>
        </h2>
        <p className="fe-section-title__sub">Spotlight · curated for the main feed</p>
      </div>

      <div className="fe-spotlight__rail" role="list">
        {performers.map((p, i) => (
          <article
            key={p.id}
            className={`fe-spot-card${onOpenPerformer ? ' fe-spot-card--interactive' : ''}`}
            role="listitem"
            style={{ '--fe-delay': `${i * 70}ms` } as CSSProperties}
            tabIndex={onOpenPerformer ? 0 : undefined}
            onClick={() => onOpenPerformer?.(p.id)}
            onKeyDown={(e) => {
              if (!onOpenPerformer) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpenPerformer(p.id)
              }
            }}
          >
            <div className="fe-spot-card__halo" aria-hidden="true" />
            <div className="fe-spot-card__poster" style={{ background: p.gradient }}>
              <span className="fe-spot-card__initials">{initials(p.name)}</span>
              <span className="fe-spot-card__shine" aria-hidden="true" />
            </div>
            <div className="fe-spot-card__body">
              <p className="fe-spot-card__eyebrow">HEADLINER ENERGY</p>
              <h3 className="fe-spot-card__name">{p.name}</h3>
              <p className="fe-spot-card__name-ja">{p.nameJa}</p>
              <p className="fe-spot-card__act">{p.act}</p>
              <p className="fe-spot-card__tagline">{p.tagline}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
