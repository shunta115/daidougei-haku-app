import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { listLiveHistory, updatePerformer } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { LiveSession } from '../lib/types'

export function PerformerHomeScreen({ onEdit, onLive, onHistory }: { onEdit: () => void; onLive: () => void; onHistory: () => void }) {
  const { performer, profile, refreshProfile } = useAuth()
  const [recent, setRecent] = useState<LiveSession[]>([])

  useEffect(() => {
    if (!performer) return
    listLiveHistory(performer.id).then((rows) => setRecent(rows.slice(0, 3))).catch(() => setRecent([]))
  }, [performer])

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

      {recent.length > 0 ? (
        <>
          <h2 className="pl-h1" style={{ fontSize: '1.1rem', marginTop: 24 }}>
            Recent lives
          </h2>
          {recent.map((s) => (
            <div key={s.id} className="pl-card">
              <div style={{ fontWeight: 600 }}>{new Date(s.started_at).toLocaleString()}</div>
              <div className="pl-muted">{s.ended_at ? 'Ended' : 'Open'} · tips {s.tip_count}</div>
            </div>
          ))}
        </>
      ) : null}
    </>
  )
}
