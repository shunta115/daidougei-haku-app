import type { Performer } from '../../types'

export type HomeUpcomingStreamsProps = {
  performers: readonly Performer[]
  onOpen: (performerId: string) => void
  onOpenDetail: (performerId: string) => void
}

/** LIVE中以外の、配信可能なパフォーマー（近日配信） */
export function HomeUpcomingStreams({ performers, onOpen, onOpenDetail }: HomeUpcomingStreamsProps) {
  if (performers.length === 0) return null

  return (
    <section className="fe-stream-soon" aria-labelledby="fe-stream-soon-title">
      <header className="fe-stream-soon__head">
        <p className="fe-stream-soon__eyebrow" lang="en">
          UPCOMING STREAMS
        </p>
        <h2 id="fe-stream-soon-title" className="fe-stream-soon__title">
          近日配信
        </h2>
        <p className="fe-stream-soon__sub">承認済みパフォーマーの次の配信をお楽しみに。</p>
      </header>
      <ul className="fe-stream-soon__list">
        {performers.map((p) => (
          <li key={p.id}>
            <article className="fe-stream-soon__card">
              <button type="button" className="fe-stream-soon__hit" onClick={() => onOpenDetail(p.id)}>
                <span className="fe-stream-soon__name">{p.nameJa}</span>
                <span className="fe-stream-soon__meta">
                  {p.country} · {p.genre ?? p.actJa}
                </span>
                {p.streamTitle ? <span className="fe-stream-soon__title-line">{p.streamTitle}</span> : null}
              </button>
              <button type="button" className="fe-stream-soon__open" onClick={() => onOpen(p.id)}>
                配信ページ
              </button>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
