import { useEffect, useState } from 'react'
import { listNotifications, markNotificationRead } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { NotificationRow } from '../lib/types'

type Props = {
  onOpenLive?: (performerId: string) => void
  onOpenPerformer?: (performerId: string) => void
}

function parseLink(link: string | null): { kind: 'live' | 'profile'; id: string } | null {
  if (!link) return null
  if (link.startsWith('live:')) return { kind: 'live', id: link.slice(5) }
  const hashLive = link.match(/#?live\/([0-9a-f-]{36})/i)
  if (hashLive) return { kind: 'live', id: hashLive[1] }
  const profile = link.match(/#?profile\/([0-9a-f-]{36})/i)
  if (profile) return { kind: 'profile', id: profile[1] }
  return null
}

export function NotificationsScreen({ onOpenLive, onOpenPerformer }: Props) {
  const { user } = useAuth()
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const next = await listNotifications(user.id)
      setRows(next)
      setError(null)
    }
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
    const timer = window.setInterval(() => {
      load().catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [user])

  const open = async (n: NotificationRow) => {
    if (!n.read_at) {
      await markNotificationRead(n.id)
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)))
    }
    const parsed = parseLink(n.link)
    if (!parsed) return
    if (parsed.kind === 'live') onOpenLive?.(parsed.id)
    else onOpenPerformer?.(parsed.id)
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
