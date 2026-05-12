import { FUTURE_CAPABILITIES } from '../../data/scheduleData'

export function FutureRoadmapSection() {
  return (
    <section className="fe-roadmap" aria-labelledby="fe-rm-h">
      <div className="fe-roadmap__head">
        <h2 id="fe-rm-h" className="fe-section-title">
          <span className="fe-section-title__eyebrow">Future</span>
          <span className="fe-section-title__main">将来構想</span>
        </h2>
        <p className="fe-section-title__sub">多言語 · プッシュ · 混雑 · 投票 · TikTok · チケット / グッズ · Supabase · PWA などを段階接続。</p>
      </div>
      <ul className="fe-roadmap__grid">
        {FUTURE_CAPABILITIES.map((cap) => (
          <li key={cap.id} className="fe-roadmap__chip">
            <span className="fe-roadmap__chip-title">{cap.titleJa}</span>
            <span className="fe-roadmap__chip-hint">{cap.hint}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
