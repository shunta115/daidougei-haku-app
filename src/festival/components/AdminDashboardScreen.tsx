import { useState } from 'react'
import { VENUE_AREAS, SCHEDULE_SLOTS } from '../data/scheduleData'
import { slotsSorted, statusLabelJa } from '../lib/scheduleEngine'
import { readAdminOps, patchAdminOps, type AdminOpsState } from '../lib/adminOpsStorage'
import { AdminRegistrationsList } from './admin/AdminRegistrationsList'
import { AdminStreamApprovals } from './admin/AdminStreamApprovals'

type AdminTab = 'registrations' | 'streamApprovals' | 'schedule' | 'stages' | 'live' | 'comms' | 'push'

type AdminDashboardScreenProps = {
  onExit: () => void
}

export function AdminDashboardScreen({ onExit }: AdminDashboardScreenProps) {
  const [tab, setTab] = useState<AdminTab>('registrations')
  const [ops, setOps] = useState<AdminOpsState>(() => readAdminOps())

  const saveOps = (partial: Partial<AdminOpsState>) => {
    setOps(patchAdminOps(partial))
  }

  const slots = slotsSorted()

  return (
    <main className="fe-main fe-main--admin fe-main--dash">
      <header className="fe-page-head">
        <button type="button" className="fe-page-head__back" onClick={onExit}>
          ← 来場者モードへ
        </button>
        <p className="fe-page-head__eyebrow" lang="en">
          STAFF LIVE OS
        </p>
        <h1 className="fe-page-head__title">運営ダッシュボード</h1>
        <p className="fe-page-head__lead">登録 · スケジュール · 配信 · お知らせをこの端末に集約（デモ / localStorage）。</p>
      </header>

      <nav className="fe-adash-tabs" aria-label="運営セクション">
        {(
          [
            ['registrations', '登録'],
            ['streamApprovals', '配信審査'],
            ['schedule', 'スケジュール'],
            ['stages', 'ステージ'],
            ['live', 'LIVE状態'],
            ['comms', 'お知らせ'],
            ['push', 'プッシュUI'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`fe-adash-tab${tab === id ? ' fe-adash-tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'registrations' ? <AdminRegistrationsList /> : null}

      {tab === 'streamApprovals' ? <AdminStreamApprovals /> : null}

      {tab === 'schedule' ? (
        <section className="fe-adash-panel" aria-label="出演スケジュール">
          <p className="fe-adash-hint">読み取り専用ビュー。本番は CMS / API で編集。</p>
          <div className="fe-adash-slot-grid">
            {slots.map((s) => (
              <article key={s.id} className="fe-adash-slot">
                <p className="fe-adash-slot-d">{s.date}</p>
                <p className="fe-adash-slot-t">
                  {s.start}–{s.end}
                </p>
                <p className="fe-adash-slot-st">{s.stageJa}</p>
                <p className="fe-adash-slot-p">ID:{s.performerId}</p>
                <span className="fe-adash-slot-badge">{statusLabelJa(s.status)}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'stages' ? (
        <section className="fe-adash-panel" aria-label="ステージ別">
          <div className="fe-adash-stage-grid">
            {VENUE_AREAS.map((v) => (
              <article key={v.id} className="fe-adash-stage">
                <h3 className="fe-adash-stage-n">{v.nameJa}</h3>
                <p className="fe-adash-stage-e" lang="en">
                  {v.nameEn}
                </p>
                <p className="fe-adash-stage-c">
                  本日の枠: {SCHEDULE_SLOTS.filter((x) => x.venueId === v.id).length}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'live' ? (
        <section className="fe-adash-panel" aria-label="LIVE配信状態">
          <p className="fe-adash-hint">来場者アプリのライブデッキと同期する想定のモック状態。</p>
          <div className="fe-adash-live-row">
            {(['off', 'standby', 'live'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`fe-adash-live-btn${ops.liveChannel === m ? ' fe-adash-live-btn--on' : ''}`}
                onClick={() => saveOps({ liveChannel: m })}
              >
                {m === 'off' ? 'OFF' : m === 'standby' ? 'STANDBY' : 'LIVE'}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'comms' ? (
        <section className="fe-adash-panel" aria-label="お知らせと雨天情報">
          <label className="fe-field">
            <span className="fe-label">来場者向けお知らせ（トップに短文表示）</span>
            <textarea
              className="fe-textarea"
              rows={3}
              value={ops.announcements}
              onChange={(e) => setOps((o) => ({ ...o, announcements: e.target.value }))}
              onBlur={() => saveOps({ announcements: ops.announcements })}
            />
          </label>
          <label className="fe-field">
            <span className="fe-label">雨天・変更メモ</span>
            <textarea
              className="fe-textarea"
              rows={4}
              value={ops.weatherNotes}
              onChange={(e) => setOps((o) => ({ ...o, weatherNotes: e.target.value }))}
              onBlur={() => saveOps({ weatherNotes: ops.weatherNotes })}
            />
          </label>
          <button type="button" className="fe-btn fe-btn--primary fe-btn--block" onClick={() => saveOps(ops)}>
            保存して反映
          </button>
        </section>
      ) : null}

      {tab === 'push' ? (
        <section className="fe-adash-panel" aria-label="プッシュ通知UI">
          <label className="fe-field">
            <span className="fe-label">プッシュ文案ドラフト</span>
            <textarea
              className="fe-textarea"
              rows={5}
              value={ops.pushDraft}
              onChange={(e) => setOps((o) => ({ ...o, pushDraft: e.target.value }))}
            />
          </label>
          <div className="fe-adash-push-preview">
            <p className="fe-adash-push-k">プレビュー</p>
            <div className="fe-adash-push-card">
              <p className="fe-adash-push-app">大道芸博</p>
              <p className="fe-adash-push-body">{ops.pushDraft.trim() || 'まもなく開演 — 運河ウォークへ'}</p>
            </div>
          </div>
          <button type="button" className="fe-btn fe-btn--glass fe-btn--block" onClick={() => saveOps({ pushDraft: ops.pushDraft })}>
            ドラフトを保存
          </button>
        </section>
      ) : null}
    </main>
  )
}
