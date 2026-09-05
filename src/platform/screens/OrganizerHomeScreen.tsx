import { useState } from 'react'
import { FESTIVAL_PATH, spaGo } from '../../app/routes'
import { createBookingInquiry, searchPerformers } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Performer } from '../lib/types'
import { Avatar } from '../components/Avatar'

type Props = {
  onOpenPerformer: (id: string) => void
}

export function OrganizerHomeScreen({ onOpenPerformer }: Props) {
  const { user, profile, signOut } = useAuth()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Performer[]>([])
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<Performer | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    try {
      setRows(await searchPerformers(q))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '検索に失敗しました')
    }
  }

  const send = async () => {
    if (!user || !target || !message.trim()) return
    try {
      await createBookingInquiry(user.id, target.id, message)
      setStatus(`${target.stage_name} へ依頼を送りました`)
      setMessage('')
      setTarget(null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました。migration 適用後に利用できます。')
    }
  }

  return (
    <>
      <p className="pl-brand">大道芸博</p>
      <h1 className="pl-h1">主催者デスク</h1>
      <p className="pl-muted">
        {profile?.display_name} さん。パフォーマーを探して出演依頼を送れます。案件ボードは次フェーズです。
      </p>
      <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" style={{ marginBottom: 12 }} onClick={() => spaGo(FESTIVAL_PATH)}>
        受賞者たち（開催情報）
      </button>
      <input className="pl-input" placeholder="名前・ジャンル・地域" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="button" className="pl-btn pl-btn--block" style={{ marginTop: 8 }} onClick={() => void search()}>
        検索
      </button>
      {rows.map((p) => (
        <div key={p.id} className="pl-card pl-row" style={{ marginTop: 10 }}>
          <Avatar url={p.photo_url} name={p.stage_name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{p.stage_name}</div>
            <div className="pl-muted">
              {p.genre}
              {p.city ? ` · ${p.city}` : ''}
            </div>
          </div>
          <button type="button" className="pl-btn pl-btn--ghost" onClick={() => onOpenPerformer(p.id)}>
            見る
          </button>
          <button type="button" className="pl-btn" onClick={() => setTarget(p)}>
            依頼
          </button>
        </div>
      ))}
      {target ? (
        <div className="pl-card" style={{ marginTop: 16 }}>
          <p className="pl-muted">{target.stage_name} への出演依頼</p>
          <textarea className="pl-textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="日程・場所・ギャラの目安など" />
          <button type="button" className="pl-btn pl-btn--block" disabled={!message.trim()} onClick={() => void send()}>
            送信
          </button>
        </div>
      ) : null}
      {status ? <p className="pl-muted">{status}</p> : null}
      {error ? <p className="pl-error">{error}</p> : null}
      <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" style={{ marginTop: 20 }} onClick={() => void signOut()}>
        ログアウト
      </button>
    </>
  )
}
