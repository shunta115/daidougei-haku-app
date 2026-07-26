import type { Performer } from '../types'
import { initials } from '../lib/initials'

type TrendingSectionProps = {
  performers: Performer[]
  onOpenPerformer?: (id: string) => void
}

export function TrendingSection({ performers, onOpenPerformer }: TrendingSectionProps) {
  return (
    <section className="fe-trend" aria-labelledby="fe-trend-heading">
      <div className="fe-trend__head">
        <h2 id="fe-trend-heading" className="fe-section-title">
          <span className="fe-section-title__eyebrow" lang="en">
            Tonight&apos;s drift
          </span>
          <span className="fe-section-title__main">今夜の気配</span>
        </h2>
        <p className="fe-section-title__sub">編集部と会場シグナルでつくる、今夜のライトアップ（デモ）</p>
      </div>

      <ol className="fe-trend__list">
        {performers.map((p, idx) => (
          <li key={p.id}>
            <button
              type="button"
              className={`fe-trend-row${onOpenPerformer ? ' fe-trend-row--btn' : ''}`}
              onClick={() => onOpenPerformer?.(p.id)}
            >
              <span className="fe-trend-row__rank" aria-label={`キュレーション ${idx + 1}`}>
                {idx + 1}
                {idx < 3 ? <span className="fe-trend-row__hot">NOW</span> : null}
              </span>
              <div className="fe-trend-row__avatar" style={{ background: p.gradient }} aria-hidden="true">
                <span>{initials(p.name)}</span>
              </div>
              <div className="fe-trend-row__body">
                <p className="fe-trend-row__name">{p.name}</p>
                <p className="fe-trend-row__meta">
                  {p.act} · {p.locale}
                </p>
              </div>
              <div className="fe-trend-row__meter" aria-hidden="true" title="会場での注目度（イメージ）">
                <span className="fe-trend-row__meter-fill" style={{ width: `${p.heat}%` }} />
              </div>
              <div className="fe-trend-row__stats fe-trend-row__stats--soft">
                <span className="fe-trend-row__signal">Momentum</span>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
