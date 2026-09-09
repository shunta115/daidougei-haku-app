import { useEffect, useState } from 'react'
import {
  approvePerformer,
  fetchAdminMetrics,
  listPendingPerformers,
  listUsers,
  softDeleteUser,
  suspendUser,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatYen } from '../lib/money'
import type { AdminMetrics, Performer } from '../lib/types'
import { Avatar } from '../components/Avatar'

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="pl-card" style={{ margin: 0 }}>
      <div className="pl-muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

export function AdminDashboardScreen() {
  const { signOut } = useAuth()
  const [m, setM] = useState<AdminMetrics | null>(null)
  const [pending, setPending] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    try {
      const [metrics, list] = await Promise.all([fetchAdminMetrics(), listPendingPerformers()])
      setM(metrics)
      setPending(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  return (
    <>
      <div className="pl-top">
        <div>
          <p className="pl-brand">Admin</p>
          <h1 className="pl-h1" style={{ margin: 0 }}>
            Today
          </h1>
        </div>
        <button type="button" className="pl-btn pl-btn--ghost" onClick={() => void reload()}>
          Refresh
        </button>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Metric label="今日の登録" value={m?.signups_today ?? '—'} />
        <Metric label="パフォーマー" value={m?.performers_total ?? '—'} />
        <Metric label="ファン" value={m?.fans_total ?? '—'} />
        <Metric label="ライブ数" value={m?.lives_total ?? '—'} />
        <Metric label="ライブ中" value={m?.live_now ?? '—'} />
        <Metric label="投げ銭件数" value={m?.tips_today_count ?? '—'} />
        <Metric label="投げ銭総額" value={m ? formatYen(m.tips_today_amount) : '—'} />
        <Metric label="運営手数料" value={m ? formatYen(m.fees_today) : '—'} />
        <Metric label="DAU" value={m?.dau_proxy ?? '—'} />
        <Metric label="MAU" value={m?.mau_proxy ?? '—'} />
      </div>

      <h2 className="pl-h2" style={{ marginTop: 24 }}>
        Pending performers
      </h2>
      {pending.length === 0 ? <div className="pl-empty">No pending approvals.</div> : null}
      {pending.map((p) => (
        <div key={p.id} className="pl-card pl-row">
          <Avatar url={p.photo_url} name={p.stage_name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{p.stage_name}</div>
            <div className="pl-muted">{p.genre || 'No genre'}</div>
          </div>
          <button
            type="button"
            className="pl-btn"
            onClick={() =>
              void approvePerformer(p.id)
                .then(reload)
                .catch((e) => setError(e instanceof Error ? e.message : 'Approve failed'))
            }
          >
            Approve
          </button>
        </div>
      ))}

      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  )
}

export { AdminEventScreen } from './AdminEventOps'

export function AdminUsersScreen() {
  const [rows, setRows] = useState<
    Array<{ id: string; display_name: string; role: string; status: string; email: string | null }>
  >([])
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    try {
      setRows(await listUsers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  return (
    <>
      <h1 className="pl-h1">Users</h1>
      {error ? <p className="pl-error">{error}</p> : null}
      {rows.map((u) => (
        <div key={u.id} className="pl-card">
          <div style={{ fontWeight: 700 }}>{u.display_name}</div>
          <div className="pl-muted">
            {u.role} · {u.status} · {u.email}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pl-btn pl-btn--ghost"
              onClick={() => {
                if (!window.confirm('Suspend this account?')) return
                void suspendUser(u.id)
                  .then(reload)
                  .catch((e) => setError(e instanceof Error ? e.message : 'Suspend failed'))
              }}
            >
              Suspend
            </button>
            <button
              type="button"
              className="pl-btn pl-btn--danger"
              onClick={() => {
                if (!window.confirm('Soft-delete this account?')) return
                void softDeleteUser(u.id)
                  .then(reload)
                  .catch((e) => setError(e instanceof Error ? e.message : 'Delete failed'))
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
