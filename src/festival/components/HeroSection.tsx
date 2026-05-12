type HeroSectionProps = {
  onOpenArtists: () => void
  actCount: number
  onShareFestival?: () => void
}

export function HeroSection({ onOpenArtists, actCount, onShareFestival }: HeroSectionProps) {
  return (
    <section className="fe-hero" aria-labelledby="fe-hero-title">
      <div className="fe-hero__frame" aria-hidden="true">
        <span className="fe-hero__beam fe-hero__beam--1" />
        <span className="fe-hero__beam fe-hero__beam--2" />
        <span className="fe-hero__ring" />
      </div>

      <div className="fe-hero__content">
        <p className="fe-hero__kicker">
          <span className="fe-hero__kicker-line" />
          Yokohama · 2026
        </p>

        <h1 id="fe-hero-title" className="fe-hero__title">
          <span className="fe-hero__title-en">Street Performance</span>
          <span className="fe-hero__title-en fe-hero__title-en--accent">Expo</span>
          <span className="fe-hero__title-ja">大道芸博</span>
        </h1>

        <p className="fe-hero__lead">
          Immersive lineup · glass stages · neon nights. 世界水準のストリートフェス体験を、片手のスマホで。
        </p>

        <dl className="fe-hero__stats">
          <div>
            <dt>日程</dt>
            <dd>
              <strong>11.07</strong> — 11.09
            </dd>
          </div>
          <div>
            <dt>会場</dt>
            <dd>みなとみらいエリア</dd>
          </div>
          <div>
            <dt>Acts</dt>
            <dd>
              <strong>{actCount}</strong> curated
            </dd>
          </div>
        </dl>

        <div className="fe-hero__actions">
          <button type="button" className="fe-btn fe-btn--primary" onClick={onOpenArtists}>
            Explore artists
          </button>
          {onShareFestival ? (
            <button type="button" className="fe-btn fe-btn--glass" onClick={() => void onShareFestival()}>
              Share
            </button>
          ) : (
            <button type="button" className="fe-btn fe-btn--glass" disabled title="Coming soon">
              Tickets
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
