import type { Performer } from '../../types'
import { initials } from '../../lib/initials'

type HomeRecommendedRowProps = {
  performers: readonly Performer[]
  onOpenDetail: (id: string) => void
}

export function HomeRecommendedRow({ performers, onOpenDetail }: HomeRecommendedRowProps) {
  if (!performers.length) return null
  return (
    <section className="fe-h6-rec" aria-label="おすすめ出演者">
      <h2 className="fe-h6-rec__title">おすすめ出演者</h2>
      <p className="fe-h6-rec__sub">初めての方はここから選ぶと迷いません</p>
      <div className="fe-h6-rec__row" role="list">
        {performers.slice(0, 4).map((p) => (
          <button key={p.id} type="button" role="listitem" className="fe-h6-rec__card" onClick={() => onOpenDetail(p.id)}>
            <span
              className={`fe-h6-rec__av${p.photoUrl ? ' fe-h6-rec__av--photo' : ''}`}
              style={p.photoUrl ? { backgroundImage: `url(${p.photoUrl})` } : { background: p.gradient }}
            >
              {!p.photoUrl ? initials(p.name) : null}
            </span>
            <span className="fe-h6-rec__name">{p.nameJa}</span>
            <span className="fe-h6-rec__genre">{p.genre ?? p.actJa}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
