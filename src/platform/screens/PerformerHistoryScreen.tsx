import { useEffect, useState } from 'react'
import { listLiveHistory, listTipsForPerformer, tipSummaryForPerformer } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatYen } from '../lib/money'
import type { LiveSession, TipRow, TipSummary } from '../lib/types'

export function PerformerHistoryScreen({ onBack }: { onBack: () => void }) {
  const { performer } = useAuth()
  const [rows, setRows] = useState<LiveSession[]>([])
  const [tips, setTips] = useState<TipRow[]>([])
  const [summary, setSummary] = useState<TipSummary>({ count: 0, amount_total: 0, fee_total: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!performer) return
    const load = async () => {
      const [next, tipRows, tipSum] = await Promise.all([
        listLiveHistory(performer.id),
        listTipsForPerformer(performer.id),
        tipSummaryForPerformer(performer.id),
      ])
      setRows(next)
      setTips(tipRows)
      setSummary(tipSum)
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
      <h1 className="pl-h1">Earnings & history</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div className="pl-card" style={{ margin: 0 }}>
          <div className="pl-muted" style={{ fontSize: 12 }}>
            Tips
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.count}</div>
        </div>
        <div className="pl-card" style={{ margin: 0 }}>
          <div className="pl-muted" style={{ fontSize: 12 }}>
            Total
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatYen(summary.amount_total)}</div>
        </div>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}

      <h2 className="pl-h2">Tips</h2>
      {tips.length === 0 && !error ? <div className="pl-empty">No tips yet.</div> : null}
      {tips.map((t) => (
        <div key={t.id} className="pl-card">
          <div style={{ fontWeight: 700 }}>{formatYen(t.amount_cents)}</div>
          <div className="pl-muted">
            {new Date(t.created_at).toLocaleString()} · {t.status} · fee {formatYen(t.platform_fee_cents)}
          </div>
        </div>
      ))}

      <h2 className="pl-h2" style={{ marginTop: 24 }}>
        Live sessions
      </h2>
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
