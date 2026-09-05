import { useCallback, useEffect, useState } from 'react'
import { decideOpsProposal, fetchOpsInbox, runOpsAnalysis, type OpsInbox } from '../lib/opsApi'
import { formatYen } from '../lib/money'

function deltaLabel(today: number | null | undefined, yesterday: number | null | undefined): string {
  if (today == null) return '—'
  if (yesterday == null || yesterday === 0) return yesterday == null ? '前日比 計測データ不足' : String(today)
  const pct = Math.round(((today - yesterday) / yesterday) * 1000) / 10
  const sign = pct > 0 ? '+' : ''
  return `${today}（${sign}${pct}%）`
}

export function AdminOpsScreen() {
  const [box, setBox] = useState<OpsInbox | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setBox(await fetchOpsInbox())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗（ops SQL未適用の可能性）')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await runOpsAnalysis()
      setMsg('分析を保存しました。提案は自動実行しません。')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const decide = async (id: string, decision: 'approved' | 'revised' | 'rejected') => {
    let note = ''
    if (decision === 'revised') {
      note = window.prompt('修正メモ（AIは実行しません）') ?? ''
      if (!note.trim()) return
    }
    setBusy(true)
    try {
      await decideOpsProposal(id, decision, note)
      setMsg(decision === 'approved' ? '承認を記録しました。危険操作は実行していません。' : '記録しました。')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const today = box?.today
  const y = box?.yesterday
  const ceo = box?.proposals.find((p) => p.agent === 'ceo')
  const growth = box?.proposals.find((p) => p.agent === 'growth')

  return (
    <>
      <h1 className="pl-h1">AI Command Center</h1>
      <p className="pl-muted">提案まで。決済・BAN・通知・出演確定は自動実行しません。</p>
      {error ? <p className="pl-error">{error}</p> : null}
      {msg ? <p className="pl-muted">{msg}</p> : null}

      <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void run()}>
        {busy ? '処理中…' : '分析を回す'}
      </button>

      <h2 className="pl-h2" style={{ marginTop: 24 }}>
        TODAY
      </h2>
      {!today ? (
        <p className="pl-muted">本日スナップショットなし。上のボタンで作成します。</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="pl-card" style={{ margin: 0 }}>
            <div className="pl-muted">登録</div>
            <div style={{ fontWeight: 700 }}>{deltaLabel(today.signups, y?.signups)}</div>
          </div>
          <div className="pl-card" style={{ margin: 0 }}>
            <div className="pl-muted">投げ銭件数</div>
            <div style={{ fontWeight: 700 }}>{deltaLabel(today.tips_count, y?.tips_count)}</div>
          </div>
          <div className="pl-card" style={{ margin: 0 }}>
            <div className="pl-muted">投げ銭金額</div>
            <div style={{ fontWeight: 700 }}>
              {typeof today.tips_amount === 'number' ? formatYen(today.tips_amount) : '—'}
            </div>
          </div>
          <div className="pl-card" style={{ margin: 0 }}>
            <div className="pl-muted">LIVE数</div>
            <div style={{ fontWeight: 700 }}>{deltaLabel(today.lives, y?.lives)}</div>
          </div>
          <div className="pl-card" style={{ margin: 0 }}>
            <div className="pl-muted">DAU相当</div>
            <div style={{ fontWeight: 700 }}>{deltaLabel(today.dau, y?.dau)}</div>
          </div>
          <div className="pl-card" style={{ margin: 0 }}>
            <div className="pl-muted">フォロー</div>
            <div style={{ fontWeight: 700 }}>{deltaLabel(today.follows, y?.follows)}</div>
          </div>
          <div className="pl-card" style={{ margin: 0 }}>
            <div className="pl-muted">投票</div>
            <div style={{ fontWeight: 700 }}>{deltaLabel(today.votes, y?.votes)}</div>
          </div>
        </div>
      )}

      <h2 className="pl-h2" style={{ marginTop: 24 }}>
        ALERT
      </h2>
      {(box?.alerts ?? []).length === 0 ? <p className="pl-muted">アラートはありません。</p> : null}
      {(box?.alerts ?? []).map((a) => (
        <p key={a.text} className="pl-card">
          {a.text}
        </p>
      ))}

      <h2 className="pl-h2" style={{ marginTop: 24 }}>
        OPPORTUNITY
      </h2>
      <p className="pl-card" style={{ whiteSpace: 'pre-wrap' }}>
        {ceo?.body ?? growth?.body ?? '分析を回すと機会が表示されます。'}
      </p>

      <h2 className="pl-h2" style={{ marginTop: 24 }}>
        AI PROPOSALS
      </h2>
      {(box?.proposals ?? []).length === 0 ? <div className="pl-empty">提案はまだありません。</div> : null}
      {(box?.proposals ?? []).map((p) => (
        <div key={p.id} className="pl-card">
          <div className="pl-muted">{p.agent === 'ceo' ? 'CEO Agent' : 'Growth Agent'}</div>
          <div style={{ fontWeight: 700, margin: '6px 0' }}>{p.title}</div>
          <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: 0 }}>{p.body}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="pl-btn" disabled={busy} onClick={() => void decide(p.id, 'approved')}>
              承認
            </button>
            <button type="button" className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => void decide(p.id, 'revised')}>
              修正
            </button>
            <button type="button" className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => void decide(p.id, 'rejected')}>
              却下
            </button>
          </div>
        </div>
      ))}

      <h2 className="pl-h2" style={{ marginTop: 24 }}>
        学習履歴
      </h2>
      {(box?.memories ?? []).length === 0 ? <p className="pl-muted">承認・却下の記録はまだありません。</p> : null}
      {(box?.memories ?? []).map((m) => (
        <div key={m.id} className="pl-card">
          <div style={{ fontWeight: 700 }}>{m.summary}</div>
          <div className="pl-muted">{m.why}</div>
        </div>
      ))}
    </>
  )
}
