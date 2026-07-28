import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { listLiveHistory, listTipsForPerformer, tipSummaryForPerformer, updatePerformer } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatYen } from '../lib/money'
import type { LiveSession, TipRow, TipSummary } from '../lib/types'

export function PerformerHomeScreen({ onEdit, onLive, onHistory }: { onEdit: () => void; onLive: () => void; onHistory: () => void }) {
  const { performer, profile, refreshProfile } = useAuth()
  const [recent, setRecent] = useState<LiveSession[]>([])
  const [tips, setTips] = useState<TipRow[]>([])
  const [summary, setSummary] = useState<TipSummary>({ count: 0, amount_total: 0, fee_total: 0 })

  useEffect(() => {
    if (!performer) return
    const load = async () => {
      const [rows, tipRows, tipSum] = await Promise.all([
        listLiveHistory(performer.id),
        listTipsForPerformer(performer.id),
        tipSummaryForPerformer(performer.id),
      ])
      setRecent(rows.slice(0, 3))
      setTips(tipRows.slice(0, 5))
      setSummary(tipSum)
      await refreshProfile()
    }
    load().catch(() => {
      setRecent([])
      setTips([])
    })
    const timer = window.setInterval(() => {
      load().catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [performer, refreshProfile])

  if (!performer || !profile) return <p className="pl-muted">Loading…</p>

  return (
    <>
      <div className="pl-card pl-row">
        <Avatar url={performer.photo_url ?? profile.avatar_url} name={performer.stage_name} large />
        <div style={{ flex: 1 }}>
          <h1 className="pl-h1" style={{ margin: 0, fontSize: '1.4rem' }}>
            {performer.stage_name}
          </h1>
          <p className="pl-muted" style={{ margin: '4px 0 0' }}>
            {performer.is_approved ? 'Public' : 'Pending approval'}
            {performer.is_live ? ' · LIVE' : ''}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div className="pl-card" style={{ margin: 0 }}>
          <div className="pl-muted" style={{ fontSize: 12 }}>
            Tips received
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.count}</div>
        </div>
        <div className="pl-card" style={{ margin: 0 }}>
          <div className="pl-muted" style={{ fontSize: 12 }}>
            Tip total
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatYen(summary.amount_total)}</div>
        </div>
      </div>

      {!performer.is_approved ? (
        <p className="pl-muted">An admin must approve your profile before fans can find you.</p>
      ) : null}

      <button type="button" className="pl-btn pl-btn--block pl-btn--live" onClick={onLive}>
        {performer.is_live ? 'Manage live' : 'Go live'}
      </button>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={onEdit}>
        Edit profile
      </button>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={onHistory}>
        Live history
      </button>
      <button
        type="button"
        className="pl-btn pl-btn--block pl-btn--ghost"
        onClick={() => {
          void (async () => {
            await updatePerformer(performer.id, { share_location: !performer.share_location })
            await refreshProfile()
          })()
        }}
      >
        Location share: {performer.share_location ? 'ON' : 'OFF'}
      </button>

      <h2 className="pl-h1" style={{ fontSize: '1.1rem', marginTop: 24 }}>
        Recent tips
      </h2>
      {tips.length === 0 ? <div className="pl-empty">No tips yet.</div> : null}
      {tips.map((t) => (
        <div key={t.id} className="pl-card">
          <div style={{ fontWeight: 700 }}>{formatYen(t.amount_cents)}</div>
          <div className="pl-muted">
            {new Date(t.created_at).toLocaleString()} · fee {formatYen(t.platform_fee_cents)}
          </div>
        </div>
      ))}

      {recent.length > 0 ? (
        <>
          <h2 className="pl-h1" style={{ fontSize: '1.1rem', marginTop: 24 }}>
            Recent lives
          </h2>
          {recent.map((s) => (
            <div key={s.id} className="pl-card">
              <div style={{ fontWeight: 600 }}>{new Date(s.started_at).toLocaleString()}</div>
              <div className="pl-muted">
                {s.ended_at ? 'Ended' : 'Open'} · tips {s.tip_count} · {formatYen(s.tip_amount_total)}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </>
  )
}
