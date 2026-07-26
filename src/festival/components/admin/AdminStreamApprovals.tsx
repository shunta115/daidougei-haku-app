import { useCallback, useEffect, useState } from 'react'
import {
  getPerformers,
  setPerformerApproval,
  patchPerformerOverride,
} from '../../lib/performerCatalog'
import {
  readStreamApplications,
  seedStreamApplicationsIfEmpty,
  setStreamApplicationStatus,
} from '../../lib/streamApplicationsStorage'
import type { Performer, StreamApprovalStatus, StreamPerformerApplication } from '../../types'

const STATUS_LABEL: Record<StreamApprovalStatus, string> = {
  pending: '審査中',
  approved: '承認済み',
  rejected: '却下',
}

function PerformerStatusBadge({ p }: { p: Performer }) {
  const label =
    p.approvalStatus === 'approved'
      ? p.canStream
        ? '配信可能'
        : '承認済み（配信不可）'
      : p.approvalStatus === 'rejected'
        ? '却下'
        : '審査中'
  const mod =
    p.approvalStatus === 'approved' && p.canStream
      ? 'ok'
      : p.approvalStatus === 'rejected'
        ? 'no'
        : 'wait'
  return <span className={`fe-adash-stream-badge fe-adash-stream-badge--${mod}`}>{label}</span>
}

export function AdminStreamApprovals() {
  const [apps, setApps] = useState<StreamPerformerApplication[]>(() => readStreamApplications())
  const [performers, setPerformers] = useState(() => getPerformers())
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => {
    seedStreamApplicationsIfEmpty()
    setApps(readStreamApplications())
    setPerformers(getPerformers())
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, tick])

  const setAppStatus = (id: string, status: StreamApprovalStatus) => {
    setStreamApplicationStatus(id, status)
    refresh()
  }

  const setPerformerStatus = (id: string, status: StreamApprovalStatus, canStream: boolean) => {
    setPerformerApproval(id, status, canStream)
    refresh()
  }

  const toggleLive = (id: string, current: Performer) => {
    if (!current.canStream || current.approvalStatus !== 'approved') return
    patchPerformerOverride(id, { isLive: !current.isLive })
    refresh()
  }

  return (
    <section className="fe-adash-panel fe-adash-stream" aria-label="配信パフォーマー審査">
      <p className="fe-adash-hint">
        配信希望登録と既存パフォーマーの審査。承認済み · 配信可能のみが来場者の LIVE NOW に表示されます（isLive ON
        時）。
      </p>

      <h2 className="fe-adash-stream-h">配信希望登録（申請一覧）</h2>
      {apps.length === 0 ? (
        <p className="fe-adash-hint">申請はまだありません。</p>
      ) : (
        <ul className="fe-adash-stream-list">
          {apps.map((a) => (
            <li key={a.id}>
              <article className="fe-adash-stream-card">
                <header className="fe-adash-stream-card__head">
                  <h3 className="fe-adash-stream-card__name">{a.performerName}</h3>
                  <span className={`fe-adash-stream-badge fe-adash-stream-badge--${a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'no' : 'wait'}`}>
                    {STATUS_LABEL[a.status]}
                  </span>
                </header>
                <p className="fe-adash-stream-card__meta">
                  {a.activityRegion} · {a.genre}
                </p>
                <p className="fe-adash-stream-card__email">{a.email}</p>
                <p className="fe-adash-stream-card__desc">{a.streamDescription}</p>
                <div className="fe-adash-stream-card__actions">
                  <button type="button" className="fe-btn fe-btn--primary" onClick={() => setAppStatus(a.id, 'approved')}>
                    承認
                  </button>
                  <button type="button" className="fe-btn fe-btn--glass" onClick={() => setAppStatus(a.id, 'pending')}>
                    審査中
                  </button>
                  <button type="button" className="fe-btn fe-btn--glass" onClick={() => setAppStatus(a.id, 'rejected')}>
                    却下
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <h2 className="fe-adash-stream-h">登録パフォーマー（配信権限）</h2>
      <ul className="fe-adash-stream-list">
        {performers.map((p) => (
          <li key={p.id}>
            <article className="fe-adash-stream-card">
              <header className="fe-adash-stream-card__head">
                <h3 className="fe-adash-stream-card__name">{p.nameJa}</h3>
                <PerformerStatusBadge p={p} />
              </header>
              <p className="fe-adash-stream-card__meta">
                {p.country} · {p.genre ?? p.actJa}
              </p>
              <p className="fe-adash-stream-card__desc">
                LIVE表示: {p.isLive ? 'ON' : 'OFF'} — {p.streamTitle ?? '—'}
              </p>
              <div className="fe-adash-stream-card__actions">
                <button
                  type="button"
                  className="fe-btn fe-btn--primary"
                  onClick={() => setPerformerStatus(p.id, 'approved', true)}
                >
                  承認 · 配信可
                </button>
                <button type="button" className="fe-btn fe-btn--glass" onClick={() => setPerformerStatus(p.id, 'pending', false)}>
                  審査中
                </button>
                <button type="button" className="fe-btn fe-btn--glass" onClick={() => setPerformerStatus(p.id, 'rejected', false)}>
                  却下
                </button>
                <button
                  type="button"
                  className="fe-btn fe-btn--glass"
                  disabled={!p.canStream || p.approvalStatus !== 'approved'}
                  onClick={() => toggleLive(p.id, p)}
                >
                  {p.isLive ? 'LIVE OFF' : 'LIVE ON'}
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
