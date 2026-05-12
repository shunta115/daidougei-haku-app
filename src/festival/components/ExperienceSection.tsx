export function ExperienceSection() {
  return (
    <section id="fe-xp-anchor" className="fe-xp" aria-labelledby="fe-xp-heading">
      <div className="fe-xp__head">
        <h2 id="fe-xp-heading" className="fe-section-title">
          <span className="fe-section-title__eyebrow">Festival OS</span>
          <span className="fe-section-title__main">Experience layers</span>
        </h2>
        <p className="fe-section-title__sub">Maps · timetable · tips — wiring next</p>
      </div>

      <div className="fe-xp__grid">
        <article className="fe-xp-card">
          <h3>Visitor flow</h3>
          <p>
            下部ナビの <strong>Time / Map / Save</strong> でタイムテーブル・会場マップ・お気に入りと投げ銭導線にアクセス。出演者・運営はトップの控えめな入口から。
          </p>
        </article>
        <article className="fe-xp-card">
          <h3>Time &amp; place</h3>
          <p>日付別 / 会場別タイムテーブル、開演通知、Boiler Room的な没入リストへ拡張可能。</p>
        </article>
        <article className="fe-xp-card">
          <h3>Global-ready</h3>
          <p>英語併記・カード主体・ネオンサイン。海外フェスと同じ空気のUIキット。</p>
        </article>
      </div>
    </section>
  )
}
