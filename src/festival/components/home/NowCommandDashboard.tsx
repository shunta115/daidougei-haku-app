import type { Performer, ProgramPulse, VenueArea } from '../../types'
import { currentLiveSlot, venueById } from '../../lib/scheduleEngine'
import { stampCheckIn, stampProgress } from '../../lib/gamificationStorage'
import { shareFestival } from '../../lib/share'

export type NowCommandDashboardProps = {
  live: ProgramPulse | null
  next: ProgramPulse | null
  livePerformer: Performer | undefined
  nextPerformer: Performer | undefined
  hotVenue: VenueArea
  /** 今すぐ向かう先（LIVE 会場優先） */
  goVenueId: string | undefined
  xpTick: number
  onStamp: () => void
  onGoNow: () => void
  onOpenMap: () => void
  onOpenTips: () => void
  onOpenTimetable: () => void
  onToggleNextFavorite: () => void
  nextIsFavorite: boolean
  onOpenNextDetail: () => void
}

export function NowCommandDashboard({
  live,
  next,
  livePerformer,
  nextPerformer,
  hotVenue,
  goVenueId,
  xpTick,
  onStamp,
  onGoNow,
  onOpenMap,
  onOpenTips,
  onOpenTimetable,
  onToggleNextFavorite,
  nextIsFavorite,
  onOpenNextDetail,
}: NowCommandDashboardProps) {
  const liveSlot = currentLiveSlot()
  const stampTargetId = liveSlot?.performerId
  const prog = stampProgress()
  const goName = goVenueId ? (venueById(goVenueId)?.nameJa ?? hotVenue.nameJa) : hotVenue.nameJa

  return (
    <section className="fe-dash" aria-label="いまの状況">
      <div className="fe-dash__hot">
        <div className="fe-dash__hot-head">
          <span className="fe-dash__hot-label">FOCUS</span>
          <span className={`fe-dash__crowd fe-dash__crowd--${hotVenue.crowd ?? 'mid'}`}>
            CROWD {hotVenue.crowd ?? '—'}
          </span>
        </div>
        <p className="fe-dash__hot-venue">{hotVenue.nameJa}</p>
        <p className="fe-dash__hot-en" lang="en">
          {hotVenue.nameEn}
        </p>
        <p className="fe-dash__hot-hint">今夜の回遊の目安 · 会場ムードのフォーカス（デモ）</p>
      </div>

      <div className="fe-dash__pulse">
        <div className="fe-dash__live">
          <span className="fe-dash__tag">LIVE NOW</span>
          {livePerformer ? (
            <>
              <p className="fe-dash__name">{livePerformer.nameJa}</p>
              <p className="fe-dash__sub">{live?.stageJa}</p>
            </>
          ) : (
            <p className="fe-dash__empty">現在の LIVE 枠なし</p>
          )}
        </div>
        <button type="button" className="fe-dash__next" onClick={onOpenNextDetail}>
          <span className="fe-dash__tag fe-dash__tag--next">NEXT SHOW</span>
          {nextPerformer ? (
            <>
              <p className="fe-dash__name">{nextPerformer.nameJa}</p>
              <p className="fe-dash__sub">{next?.stageJa}</p>
              <span className="fe-dash__tap">タップで詳細</span>
            </>
          ) : (
            <p className="fe-dash__empty">次枠なし</p>
          )}
        </button>
      </div>

      <button type="button" className="fe-dash__mega" onClick={onGoNow}>
        <span className="fe-dash__mega-glow" aria-hidden="true" />
        <span className="fe-dash__mega-label">今すぐ向かう</span>
        <span className="fe-dash__mega-sub">{goName} 方面</span>
      </button>

      <div className="fe-dash__actions">
        <button type="button" className="fe-dash__chip" onClick={onOpenMap}>
          地図で見る
        </button>
        <button type="button" className="fe-dash__chip fe-dash__chip--accent" onClick={onOpenTips}>
          エールを送る
        </button>
        <button type="button" className="fe-dash__chip" onClick={onOpenTimetable}>
          タイム
        </button>
        <button type="button" className="fe-dash__chip" onClick={() => void shareFestival()}>
          シェア
        </button>
        <button
          type="button"
          className={`fe-dash__chip${nextIsFavorite ? ' fe-dash__chip--on' : ''}`}
          onClick={onToggleNextFavorite}
          disabled={!nextPerformer}
        >
          お気に入り
        </button>
      </div>

      <div className="fe-dash__stamp" data-xp-tick={xpTick}>
        <div>
          <p className="fe-dash__stamp-title">スタンプラリー（デモ）</p>
          <p className="fe-dash__stamp-meta">
            {prog.count} / 3 箇所 · {prog.badgeUnlocked ? 'コンプリート' : 'あと ' + Math.max(0, 3 - prog.count) + ' 箇所'}
          </p>
        </div>
        <button
          type="button"
          className="fe-dash__stamp-btn"
          disabled={!stampTargetId}
          onClick={() => {
            if (!stampTargetId) return
            stampCheckIn(stampTargetId)
            onStamp()
          }}
        >
          チェックイン
        </button>
      </div>

      <div className="fe-dash__support">
        <p className="fe-dash__support-title">感動したら応援</p>
        <p className="fe-dash__support-text">
          余韻のまま、各アーティストが用意した外部のサポート導線へ。静かなワンタップでエールを届けられます。
        </p>
        <button type="button" className="fe-btn fe-btn--glass fe-dash__support-btn" onClick={onOpenTips}>
          応援ページへ
        </button>
      </div>
    </section>
  )
}
