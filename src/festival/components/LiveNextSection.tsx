import type { Performer, ProgramPulse } from '../types'
import { initials } from '../lib/initials'

type LiveNextSectionProps = {
  live: ProgramPulse | null
  next: ProgramPulse | null
  livePerformer: Performer | undefined
  nextPerformer: Performer | undefined
}

function PulseVisual({ performer, variant }: { performer: Performer | undefined; variant: 'live' | 'next' }) {
  if (!performer) return null
  const usePhoto = performer.photoUrl
  return (
    <div
      className={`fe-pulse-card__visual${variant === 'next' ? ' fe-pulse-card__visual--next' : ''}${usePhoto ? ' fe-pulse-card__visual--photo' : ''}`}
      style={usePhoto ? { backgroundImage: `url(${performer.photoUrl})` } : { background: performer.gradient }}
      aria-hidden="true"
    >
      {!usePhoto ? <span className="fe-pulse-card__mono">{initials(performer.name)}</span> : null}
    </div>
  )
}

export function LiveNextSection({ live, next, livePerformer, nextPerformer }: LiveNextSectionProps) {
  const empty = !live && !next

  return (
    <section className="fe-pulse" aria-labelledby="fe-pulse-heading">
      <div className="fe-pulse__head">
        <h2 id="fe-pulse-heading" className="fe-section-title">
          <span className="fe-section-title__eyebrow">LIVE NOW · NEXT SHOW</span>
          <span className="fe-section-title__main">今と次</span>
        </h2>
        <p className="fe-section-title__sub">今開催中 · 次に始まる · デモ時刻固定（本番はスケジュール連動）</p>
      </div>

      {empty ? (
        <p className="fe-pulse-empty">現在スケジュール上の LIVE / NEXT はありません。タイムテーブルタブで全日程を確認できます。</p>
      ) : (
        <div className="fe-pulse__grid">
          {live ? (
            <article className="fe-pulse-card fe-pulse-card--live">
              <header className="fe-pulse-card__tag">
                <span className="fe-pulse-card__dot" aria-hidden="true" />
                <span>今開催中</span>
                <span className="fe-pulse-card__tag-en">LIVE NOW</span>
              </header>
              <PulseVisual performer={livePerformer} variant="live" />
              {livePerformer ? (
                <>
                  <h3 className="fe-pulse-card__name">{livePerformer.name}</h3>
                  <p className="fe-pulse-card__name-ja">{livePerformer.nameJa}</p>
                  <p className="fe-pulse-card__act">{livePerformer.act}</p>
                </>
              ) : null}
              <p className="fe-pulse-card__venue">{live.venueJa}</p>
              <p className="fe-pulse-card__venue fe-pulse-card__venue--en">{live.venueEn}</p>
              <p className="fe-pulse-card__meta">
                {live.stageJa} · <span lang="en">{live.stageEn}</span>
              </p>
              <p className="fe-pulse-card__window fe-pulse-card__window--live">{live.windowJa}</p>
              <p className="fe-pulse-card__window-en" lang="en">
                {live.windowEn}
              </p>
            </article>
          ) : (
            <article className="fe-pulse-card fe-pulse-card--live fe-pulse-card--muted">
              <header className="fe-pulse-card__tag">
                <span className="fe-pulse-card__dot fe-pulse-card__dot--off" aria-hidden="true" />
                <span>今開催中</span>
                <span className="fe-pulse-card__tag-en">LIVE NOW</span>
              </header>
              <p className="fe-pulse-card__placeholder">この時間帯の LIVE はスケジュールに未定義です。</p>
            </article>
          )}

          {next ? (
            <article className="fe-pulse-card fe-pulse-card--next">
              <header className="fe-pulse-card__tag fe-pulse-card__tag--next">
                <span className="fe-pulse-card__bolt" aria-hidden="true" />
                <span>次に始まる</span>
                <span className="fe-pulse-card__tag-en">NEXT SHOW</span>
              </header>
              <PulseVisual performer={nextPerformer} variant="next" />
              {nextPerformer ? (
                <>
                  <h3 className="fe-pulse-card__name">{nextPerformer.name}</h3>
                  <p className="fe-pulse-card__name-ja">{nextPerformer.nameJa}</p>
                  <p className="fe-pulse-card__act">{nextPerformer.act}</p>
                </>
              ) : null}
              <p className="fe-pulse-card__venue">{next.venueJa}</p>
              <p className="fe-pulse-card__venue fe-pulse-card__venue--en">{next.venueEn}</p>
              <p className="fe-pulse-card__meta">
                {next.stageJa} · <span lang="en">{next.stageEn}</span>
              </p>
              <p className="fe-pulse-card__window fe-pulse-card__window--next">{next.windowJa}</p>
              <p className="fe-pulse-card__window-en" lang="en">
                {next.windowEn}
              </p>
            </article>
          ) : (
            <article className="fe-pulse-card fe-pulse-card--next fe-pulse-card--muted">
              <header className="fe-pulse-card__tag fe-pulse-card__tag--next">
                <span className="fe-pulse-card__bolt fe-pulse-card__bolt--off" aria-hidden="true" />
                <span>次に始まる</span>
                <span className="fe-pulse-card__tag-en">NEXT SHOW</span>
              </header>
              <p className="fe-pulse-card__placeholder">続く演目はタイムテーブルでご確認ください。</p>
            </article>
          )}
        </div>
      )}
    </section>
  )
}
