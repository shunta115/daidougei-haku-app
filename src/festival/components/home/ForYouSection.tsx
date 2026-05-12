import type { Performer } from '../../types'
import { initials } from '../../lib/initials'

type ForYouSectionProps = {
  favorites: Performer[]
  recommended: Performer[]
  onOpen: (id: string) => void
}

export function ForYouSection({ favorites, recommended, onOpen }: ForYouSectionProps) {
  return (
    <section className="fe-foryou" aria-labelledby="fe-fy-h">
      <div className="fe-foryou__head">
        <h2 id="fe-fy-h" className="fe-section-title">
          <span className="fe-section-title__eyebrow">For you</span>
          <span className="fe-section-title__main">あなたへのおすすめ</span>
        </h2>
        <p className="fe-section-title__sub">お気に入りと熱量シグナルをブレンド（デモロジック）</p>
      </div>

      {favorites.length ? (
        <div className="fe-foryou__block">
          <p className="fe-foryou__label">お気に入りから</p>
          <ul className="fe-foryou__list">
            {favorites.map((p) => (
              <li key={p.id}>
                <button type="button" className="fe-foryou__row" onClick={() => onOpen(p.id)}>
                  <span className="fe-foryou__av" style={{ background: p.gradient }}>
                    {initials(p.name)}
                  </span>
                  <span className="fe-foryou__name">{p.nameJa}</span>
                  <span className="fe-foryou__chev">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="fe-foryou__block">
        <p className="fe-foryou__label">あなたに合いそう</p>
        <ul className="fe-foryou__list">
          {recommended.map((p) => (
            <li key={p.id}>
              <button type="button" className="fe-foryou__row" onClick={() => onOpen(p.id)}>
                <span className="fe-foryou__av" style={{ background: p.gradient }}>
                  {initials(p.name)}
                </span>
                <span className="fe-foryou__name">{p.nameJa}</span>
                <span className="fe-foryou__meta">HEAT {p.heat}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
