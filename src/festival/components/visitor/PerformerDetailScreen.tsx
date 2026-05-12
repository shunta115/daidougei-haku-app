import type { Performer } from '../../types'
import { initials } from '../../lib/initials'
import { getDemoNow } from '../../lib/demoClock'
import {
  demoTodayDateString,
  nextSlotForPerformerFromNow,
  slotsByPerformer,
  statusLabelJa,
  todaySlotsForPerformer,
} from '../../lib/scheduleEngine'
import { sharePerformer } from '../../lib/share'

type PerformerDetailScreenProps = {
  performer: Performer
  favorite: boolean
  onClose: () => void
  onToggleFavorite: () => void
  onOpenTimetable: () => void
  onOpenTips?: () => void
  onOpenMap?: () => void
}

export function PerformerDetailScreen({
  performer: p,
  favorite,
  onClose,
  onToggleFavorite,
  onOpenTimetable,
  onOpenTips,
  onOpenMap,
}: PerformerDetailScreenProps) {
  const schedule = slotsByPerformer(p.id)
  const tips = p.tipLinks ?? []
  const now = getDemoNow()
  const today = demoTodayDateString()
  const todaySlots = todaySlotsForPerformer(p.id, today)
  const nextAfter = nextSlotForPerformerFromNow(p.id, now)

  return (
    <div className="fe-detail fe-detail--native" role="dialog" aria-modal="true" aria-labelledby="fe-detail-title">
      <header className="fe-detail__bar">
        <button type="button" className="fe-detail__back" onClick={onClose}>
          ← 戻る
        </button>
        <div className="fe-detail__bar-actions">
          <button type="button" className="fe-detail__iconbtn" onClick={() => void sharePerformer(p)} aria-label="シェア">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="fe-detail__fan"
            aria-pressed={favorite}
            onClick={onToggleFavorite}
          >
            {favorite ? '登録済み' : 'ファン登録'}
          </button>
          <button
            type="button"
            className={`fe-detail__iconbtn${favorite ? ' fe-detail__iconbtn--on' : ''}`}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
            aria-label={favorite ? 'お気に入り解除' : 'お気に入り'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill={favorite ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.35"
              />
            </svg>
          </button>
        </div>
      </header>

      <div
        className={`fe-detail__hero fe-detail__hero--mega${p.photoUrl ? ' fe-detail__hero--photo' : ''}`}
        style={
          p.photoUrl
            ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(5,5,8,0.88) 100%), url(${p.photoUrl})` }
            : { background: p.gradient }
        }
      >
        {!p.photoUrl ? <span className="fe-detail__hero-mono">{initials(p.name)}</span> : null}
        <div className="fe-detail__hero-text">
          <p className="fe-detail__eyebrow">Artist</p>
          <h1 id="fe-detail-title" className="fe-detail__title">
            {p.name}
          </h1>
          <p className="fe-detail__title-ja">{p.nameJa}</p>
          <p className="fe-detail__acts">
            {p.act} · <span lang="en">{p.actJa}</span>
          </p>
        </div>
      </div>

      <div className="fe-detail__quick">
        {onOpenMap ? (
          <button type="button" className="fe-detail__qbtn" onClick={onOpenMap}>
            地図
          </button>
        ) : null}
        {onOpenTips ? (
          <button type="button" className="fe-detail__qbtn fe-detail__qbtn--gold" onClick={onOpenTips}>
            投げ銭
          </button>
        ) : null}
        <button type="button" className="fe-detail__qbtn" onClick={() => void sharePerformer(p)}>
          シェア
        </button>
        <button type="button" className="fe-detail__qbtn" onClick={onOpenTimetable}>
          タイム
        </button>
      </div>

      {nextAfter ? (
        <div className="fe-detail__nextbar">
          <span className="fe-detail__nextbar-tag">このあと出演</span>
          <span className="fe-detail__nextbar-body">
            {nextAfter.date} {nextAfter.start} · {nextAfter.stageJa}
          </span>
        </div>
      ) : null}

      <main className="fe-detail__main">
        <section className="fe-detail-block" aria-labelledby="fe-d-today">
          <h2 id="fe-d-today" className="fe-detail-h">
            今日の出演
          </h2>
          {todaySlots.length ? (
            <ul className="fe-detail-sch">
              {todaySlots.map((slot) => (
                <li key={slot.id} className="fe-detail-sch__row">
                  <span className="fe-detail-sch__date">
                    {slot.start}–{slot.end}
                  </span>
                  <span className="fe-detail-sch__venue">{slot.stageJa}</span>
                  <span className={`fe-detail-status fe-detail-status--${slot.status}`}>{statusLabelJa(slot.status)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fe-detail-muted">本日の枠なし（デモ日付と照合）</p>
          )}
        </section>

        <section className="fe-detail-block" aria-labelledby="fe-d-bio">
          <h2 id="fe-d-bio" className="fe-detail-h">
            プロフィール
          </h2>
          <p className="fe-detail-body">{p.bio ?? p.tagline}</p>
          {p.achievementsDetail ? (
            <>
              <h3 className="fe-detail-subh">実績</h3>
              <p className="fe-detail-body">{p.achievementsDetail}</p>
            </>
          ) : null}
          {p.genre ? (
            <p className="fe-detail-tags">
              <span className="fe-chip fe-chip--neon">{p.genre}</span>
              <span className="fe-chip fe-chip--ghost">{p.locale}</span>
            </p>
          ) : null}
        </section>

        {p.snsList?.length ? (
          <section className="fe-detail-block" aria-labelledby="fe-d-sns">
            <h2 id="fe-d-sns" className="fe-detail-h">
              SNS
            </h2>
            <ul className="fe-detail-sns">
              {p.snsList.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="fe-detail-sns__a">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="fe-detail-block" aria-labelledby="fe-d-sch">
          <div className="fe-detail-block__row">
            <h2 id="fe-d-sch" className="fe-detail-h">
              全スケジュール
            </h2>
            <button type="button" className="fe-detail-link" onClick={onOpenTimetable}>
              タイムテーブルへ
            </button>
          </div>
          {schedule.length ? (
            <ul className="fe-detail-sch">
              {schedule.map((slot) => (
                <li key={slot.id} className="fe-detail-sch__row">
                  <span className="fe-detail-sch__date">
                    {slot.date} {slot.start}–{slot.end}
                  </span>
                  <span className="fe-detail-sch__venue">{slot.stageJa}</span>
                  <span className={`fe-detail-status fe-detail-status--${slot.status}`}>{statusLabelJa(slot.status)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fe-detail-muted">スケジュール未設定（デモ）</p>
          )}
        </section>

        <section className="fe-detail-block" aria-labelledby="fe-d-tip">
          <h2 id="fe-d-tip" className="fe-detail-h">
            投げ銭 · Tips
          </h2>
          <p className="fe-detail-lead">PayPay / Stripe / Square / OFUSE など外部リンクから。</p>
          {tips.length ? (
            <div className="fe-tip-grid">
              {tips.map((t) => (
                <a key={t.id} className="fe-btn fe-btn--gold fe-btn--block" href={t.url} target="_blank" rel="noopener noreferrer">
                  {t.labelJa}
                </a>
              ))}
            </div>
          ) : (
            <p className="fe-detail-muted">リンク未登録（デモ）</p>
          )}
        </section>

        {tips.length ? (
          <section className="fe-detail-aftershow" aria-labelledby="fe-d-after">
            <div className="fe-detail-aftershow__inner">
              <h2 id="fe-d-after" className="fe-detail-aftershow__title">
                感動したら応援
              </h2>
              <p className="fe-detail-aftershow__text">演目後のテンションのまま、外部リンクでサポート。</p>
              <div className="fe-detail-aftershow__row">
                {tips.map((t) => (
                  <a key={`after-${t.id}`} className="fe-btn fe-btn--glass fe-btn--compact" href={t.url} target="_blank" rel="noopener noreferrer">
                    {t.labelJa}
                  </a>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
