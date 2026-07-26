import { useState } from 'react'
import type { Performer } from '../../types'
import { RECOMMENDED_ROUTE_COURSES, type RecommendedRouteCourseId } from '../../data/recommendedRoutes'
import { performerById } from '../../data'
import { venueById } from '../../lib/scheduleEngine'

type RecommendedRoutesSectionProps = {
  onOpenPerformer: (id: string) => void
  onOpenMap: () => void
}

export function RecommendedRoutesSection({ onOpenPerformer, onOpenMap }: RecommendedRoutesSectionProps) {
  const [open, setOpen] = useState<RecommendedRouteCourseId | null>('first')

  return (
    <section className="fe-route" aria-label="今日のおすすめルート">
      <div className="fe-route__head">
        <p className="fe-route__eyebrow" lang="en">
          ROUTES
        </p>
        <h2 className="fe-route__title">今日のおすすめルート</h2>
        <p className="fe-route__lead">所要時間 · ステージ · 演者 · 休憩までワンタップで。</p>
      </div>

      <div className="fe-route__chips">
        {RECOMMENDED_ROUTE_COURSES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`fe-route__chip${open === c.id ? ' fe-route__chip--on' : ''}`}
            onClick={() => setOpen((v) => (v === c.id ? null : c.id))}
          >
            <span className="fe-route__chip-en">{c.eyebrowEn}</span>
            <span className="fe-route__chip-ja">{c.titleJa}</span>
          </button>
        ))}
      </div>

      {RECOMMENDED_ROUTE_COURSES.filter((c) => open === c.id).map((c) => (
        <article key={c.id} className="fe-route__panel">
          <p className="fe-route__panel-blur">{c.blurbJa}</p>
          <dl className="fe-route__dl">
            <div>
              <dt>所要</dt>
              <dd>約 {c.durationMin} 分</dd>
            </div>
            <div className="fe-route__dl--wide">
              <dt>ステージ</dt>
              <dd>
                {c.venueIds
                  .map((id) => venueById(id)?.nameJa ?? id)
                  .filter(Boolean)
                  .join(' → ')}
              </dd>
            </div>
            <div className="fe-route__dl--wide">
              <dt>演者</dt>
              <dd className="fe-route__acts">
                {c.performerIds
                  .map((id) => performerById(id))
                  .filter((p): p is Performer => Boolean(p))
                  .map((p) => (
                    <button key={p.id} type="button" className="fe-route__act" onClick={() => onOpenPerformer(p.id)}>
                      {p.nameJa}
                    </button>
                  ))}
              </dd>
            </div>
            <div className="fe-route__dl--wide">
              <dt>休憩</dt>
              <dd>{c.restStopsJa.join(' · ')}</dd>
            </div>
          </dl>
          <button type="button" className="fe-route__mapcta" onClick={onOpenMap}>
            MAP で回る
          </button>
        </article>
      ))}

      <button type="button" className="fe-route__ghost" onClick={onOpenMap}>
        フリールートで歩く
      </button>
    </section>
  )
}
