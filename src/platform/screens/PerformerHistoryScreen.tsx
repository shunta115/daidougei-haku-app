import { useEffect, useState } from 'react'
import { listLiveHistory } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatYen } from '../lib/money'
import type { LiveSession } from '../lib/types'

export function PerformerHistoryScreen({ onBack }: { onBack: () => void }) {
  const { performer } = useAuth()
  const [rows, setRows] = useState<LiveSession[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!performer) return
    const load = async () => {
      const next = await listLiveHistory(performer.id)
      setRows(next)
      setError(null)
    }
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
    const timer = window.setInterval(() => {
      load().catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [performer])

  return (
    <>
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        Back
      </button>
      <h1 className="pl-h1">Live history</h1>
      {error ? <p className="pl-error">{error}</p> : null}
      {rows.length === 0 && !error ? <div className="pl-empty">No sessions yet.</div> : null}
      {rows.map((s) => (
        <div key={s.id} className="pl-card">
          <div style={{ fontWeight: 600 }}>{new Date(s.started_at).toLocaleString()}</div>
          <div className="pl-muted">
            {s.ended_at ? `Ended ${new Date(s.ended_at).toLocaleString()}` : 'In progress'}
          </div>
          <div className="pl-muted">
            Tips {s.tip_count} · {formatYen(s.tip_amount_total)}
          </div>
        </div>
      ))}
    </>
  )
}
