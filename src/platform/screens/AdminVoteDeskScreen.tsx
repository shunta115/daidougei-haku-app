import { useEffect, useState } from 'react'
import { getAdminVoteDesk, getEventBySlug, listEventLineupPerformers, saveEventVoteRule, type AdminVoteDesk } from '../lib/api'
import { AWP_EVENT_SLUG } from '../../app/routes'
import type { Performer } from '../lib/types'

export function AdminVoteDeskScreen() {
  const [desk, setDesk] = useState<AdminVoteDesk | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [acts, setActs] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const reload = async () => {
    const event = await getEventBySlug(AWP_EVENT_SLUG)
    if (!event) throw new Error('AWPイベントが見つかりません')
    const [next, lineup] = await Promise.all([getAdminVoteDesk(event.id), listEventLineupPerformers(event.id)])
    setEventId(event.id)
    setDesk(next)
    setActs(lineup)
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
  }, [])

  const setOpen = async (open: boolean) => {
    if (!eventId) return
    try {
      await saveEventVoteRule(eventId, { voting_open: open })
      setMsg(open ? '投票をOPENしました' : '投票をSTOPしました')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '投票状態を更新できませんでした')
    }
  }

  return (
    <main className="pl-registration">
      <div className="pl-top">
        <div>
          <p className="pl-brand">運営</p>
          <h1 className="pl-h1" style={{ margin: 0 }}>AWP 投票デスク</h1>
        </div>
        <button type="button" className="pl-btn pl-btn--ghost" onClick={() => void reload()}>更新</button>
      </div>
      {error ? <p className="pl-error">{error}</p> : null}
      {msg ? <p className="pl-muted">{msg}</p> : null}
      {!desk ? <p className="pl-muted">読み込み中…</p> : (
        <>
          <div className="pl-card">
            <h2 className="pl-h2">受付</h2>
            <p>{desk.voting_open ? 'OPEN' : 'STOP'}</p>
            <button type="button" className="pl-btn pl-btn--block" onClick={() => void setOpen(true)}>投票 OPEN</button>
            <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" onClick={() => void setOpen(false)}>投票 STOP</button>
          </div>
          <div className="pl-card">
            <h2 className="pl-h2">集計</h2>
            <p>総投票数 {desk.total_votes}</p>
            <p>ユニーク匿名投票者 {desk.unique_voters}</p>
            <p>1人あたり上限 {desk.votes_per_voter}票</p>
          </div>
          <div className="pl-card">
            <h2 className="pl-h2">順位（運営のみ）</h2>
            {desk.ranking.length === 0 ? <p className="pl-muted">まだ票はありません。</p> : desk.ranking.map((row, index) => (
              <p key={row.performer_id}><strong>{index + 1}位 {acts.find((act) => act.id === row.performer_id)?.stage_name ?? row.performer_id}</strong> · {row.votes}票</p>
            ))}
          </div>
          <div className="pl-card">
            <h2 className="pl-h2">時間別</h2>
            {desk.hourly.length === 0 ? <p className="pl-muted">推移はまだありません。</p> : desk.hourly.map((row) => (
              <p key={row.hour}>{new Date(row.hour).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} · {row.votes}票</p>
            ))}
          </div>
          <div className="pl-card">
            <h2 className="pl-h2">異常投票候補</h2>
            <p className="pl-muted">IPでは拒否しません。短時間で3票を使い切った匿名IDのみ表示します。</p>
            {desk.anomalies.length === 0 ? <p className="pl-muted">該当なし</p> : desk.anomalies.map((row) => (
              <p key={row.voter_prefix}>{row.kind} · {row.voter_prefix}… · {row.votes}票 / {row.span_seconds}秒</p>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
