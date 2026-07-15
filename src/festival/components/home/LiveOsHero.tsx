import type { Performer, ProgramPulse } from '../../types'
import { initials } from '../../lib/initials'
import { readAdminOps } from '../../lib/adminOpsStorage'

type LiveOsHeroProps = {
  live: ProgramPulse | null
  next: ProgramPulse | null
  livePerformer?: Performer
  nextPerformer?: Performer
  pickArtist?: Performer
  onOpenLiveDetail: () => void
  onOpenNextDetail: () => void
  onOpenPickDetail: () => void
  onOpenMap: () => void
  onDiscover: () => void
  onPerformerRegister: () => void
  onOpenTimetable: () => void
}

export function LiveOsHero({
  live,
  next,
  livePerformer,
  nextPerformer,
  pickArtist,
  onOpenLiveDetail,
  onOpenNextDetail,
  onOpenPickDetail,
  onOpenMap,
  onDiscover,
  onPerformerRegister,
  onOpenTimetable,
}: LiveOsHeroProps) {
  const ops = readAdminOps()

  return (
    <section className="fe-liveos" aria-label="大道芸博ライブOS">
      <div className="fe-liveos__aurora" aria-hidden="true" />
      <div className="fe-liveos__scan" aria-hidden="true" />
      <div className="fe-liveos__hero">
        <p className="fe-liveos__brand" lang="en">
          DAIDOUGEI HAKU LIVE
        </p>
        <h1 className="fe-liveos__tagline">いま、この街がステージになる</h1>
        {ops.announcements.trim() ? (
          <p className="fe-liveos__flash">{ops.announcements.trim()}</p>
        ) : (
          <p className="fe-liveos__sub">Yokohama · urban night · street performance festival</p>
        )}
        <div className="fe-liveos__hero-actions">
          <button type="button" className="fe-liveos__btn fe-liveos__btn--primary" onClick={onOpenMap}>
            会場へ
          </button>
          <button type="button" className="fe-liveos__btn fe-liveos__btn--ghost" onClick={onOpenTimetable}>
            流れを見る
          </button>
        </div>
      </div>

      <div className="fe-liveos__deck">
        <button
          type="button"
          className={`fe-liveos__card fe-liveos__card--live${live && livePerformer ? '' : ' fe-liveos__card--dim'}`}
          onClick={onOpenLiveDetail}
        >
          <span className="fe-liveos__card-glow" aria-hidden="true" />
          <span className="fe-liveos__pill fe-liveos__pill--live">NOW LIVE</span>
          {live && livePerformer ? (
            <>
              <span
                className={`fe-liveos__vis${livePerformer.photoUrl ? ' fe-liveos__vis--photo' : ''}`}
                style={
                  livePerformer.photoUrl
                    ? { backgroundImage: `url(${livePerformer.photoUrl})` }
                    : { background: livePerformer.gradient }
                }
              >
                {!livePerformer.photoUrl ? initials(livePerformer.name) : null}
              </span>
              <span className="fe-liveos__name">{livePerformer.nameJa}</span>
              <span className="fe-liveos__meta">
                {live.stageJa} · {live.windowJa}
              </span>
            </>
          ) : (
            <span className="fe-liveos__placeholder">この枠の演目はタイムラインで</span>
          )}
        </button>

        <button
          type="button"
          className={`fe-liveos__card fe-liveos__card--next${next && nextPerformer ? '' : ' fe-liveos__card--dim'}`}
          onClick={onOpenNextDetail}
        >
          <span className="fe-liveos__card-glow fe-liveos__card-glow--next" aria-hidden="true" />
          <span className="fe-liveos__pill fe-liveos__pill--next">NEXT SHOW</span>
          {next && nextPerformer ? (
            <>
              <span
                className={`fe-liveos__vis${nextPerformer.photoUrl ? ' fe-liveos__vis--photo' : ''}`}
                style={
                  nextPerformer.photoUrl
                    ? { backgroundImage: `url(${nextPerformer.photoUrl})` }
                    : { background: nextPerformer.gradient }
                }
              >
                {!nextPerformer.photoUrl ? initials(nextPerformer.name) : null}
              </span>
              <span className="fe-liveos__name">{nextPerformer.nameJa}</span>
              <span className="fe-liveos__meta">
                {next.stageJa} · {next.windowJa}
              </span>
            </>
          ) : (
            <span className="fe-liveos__placeholder">続く演目をチェック</span>
          )}
        </button>

        <button
          type="button"
          className={`fe-liveos__card fe-liveos__card--pick${pickArtist ? '' : ' fe-liveos__card--dim'}`}
          onClick={onOpenPickDetail}
        >
          <span className="fe-liveos__card-glow fe-liveos__card-glow--pick" aria-hidden="true" />
          <span className="fe-liveos__pill fe-liveos__pill--pick">PICK UP ARTIST</span>
          {pickArtist ? (
            <>
              <span
                className={`fe-liveos__vis${pickArtist.photoUrl ? ' fe-liveos__vis--photo' : ''}`}
                style={
                  pickArtist.photoUrl ? { backgroundImage: `url(${pickArtist.photoUrl})` } : { background: pickArtist.gradient }
                }
              >
                {!pickArtist.photoUrl ? initials(pickArtist.name) : null}
              </span>
              <span className="fe-liveos__name">{pickArtist.nameJa}</span>
              <span className="fe-liveos__meta">{pickArtist.actJa}</span>
            </>
          ) : (
            <span className="fe-liveos__placeholder">今夜の注目を準備中</span>
          )}
        </button>
      </div>

      <div className="fe-liveos__rail">
        <button type="button" className="fe-liveos__rail-btn" onClick={onDiscover}>
          推しを探す
        </button>
        <button type="button" className="fe-liveos__rail-btn fe-liveos__rail-btn--accent" onClick={onPerformerRegister}>
          パフォーマー登録
        </button>
      </div>
    </section>
  )
}
