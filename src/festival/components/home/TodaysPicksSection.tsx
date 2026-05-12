import type { Performer } from '../../types'
import { initials } from '../../lib/initials'

type TodaysPicksSectionProps = {
  performers: Performer[]
  onOpen: (id: string) => void
}

export function TodaysPicksSection({ performers, onOpen }: TodaysPicksSectionProps) {
  return (
    <section className="fe-picks" aria-labelledby="fe-picks-h">
      <div className="fe-picks__head">
        <h2 id="fe-picks-h" className="fe-section-title">
          <span className="fe-section-title__eyebrow">TODAY&apos;S PICK</span>
          <span className="fe-section-title__main">本日のおすすめ</span>
        </h2>
        <p className="fe-section-title__sub">編集部ピック · 会場の主役を先取り</p>
      </div>
      <div className="fe-picks__rail">
        {performers.map((p, i) => (
          <button key={p.id} type="button" className="fe-pick-card" style={{ animationDelay: `${i * 80}ms` }} onClick={() => onOpen(p.id)}>
            <span className="fe-pick-card__shine" aria-hidden="true" />
            <div
              className={`fe-pick-card__poster${p.photoUrl ? ' fe-pick-card__poster--photo' : ''}`}
              style={
                p.photoUrl
                  ? { backgroundImage: `url(${p.photoUrl})` }
                  : { background: p.gradient }
              }
            >
              {!p.photoUrl ? <span>{initials(p.name)}</span> : null}
            </div>
            <p className="fe-pick-card__name">{p.name}</p>
            <p className="fe-pick-card__act">{p.actJa}</p>
          </button>
        ))}
      </div>
    </section>
  )
}
