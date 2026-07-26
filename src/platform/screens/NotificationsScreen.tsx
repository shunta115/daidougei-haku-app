import { useEffect, useState } from 'react'
import { listNotifications, markNotificationRead } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { NotificationRow } from '../lib/types'

export function NotificationsScreen() {
  const { user } = useAuth()
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    listNotifications(user.id)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
  }, [user])

  const open = async (n: NotificationRow) => {
    if (!n.read_at) {
      await markNotificationRead(n.id)
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)))
    }
  }

  return (
    <>
      <h1 className="pl-h1">Notifications</h1>
      {error ? <p className="pl-error">{error}</p> : null}
      {rows.length === 0 && !error ? <div className="pl-empty">No notifications.</div> : null}
      {rows.map((n) => (
        <button
          key={n.id}
          type="button"
          className="pl-card"
          style={{ width: '100%', textAlign: 'left', opacity: n.read_at ? 0.65 : 1, cursor: 'pointer' }}
          onClick={() => void open(n)}
        >
          <div style={{ fontWeight: 700 }}>{n.title}</div>
          <div className="pl-muted">{n.body}</div>
          <div className="pl-muted">{new Date(n.created_at).toLocaleString()}</div>
        </button>
      ))}
    </>
  )
}
