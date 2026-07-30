import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { LiveBadge } from '../components/LiveBadge'
import { listLivePerformers, listLiveRanking, type LiveRankRow } from '../lib/api'
import { formatYen } from '../lib/money'
import type { Performer } from '../lib/types'

type Tab = 'list' | 'rank'

type Props = {
  onWatchLive: (id: string) => void
  onOpenPerformer: (id: string) => void
  initialTab?: Tab
}

function liveDuration(startedAt: string | null) {
  if (!startedAt) return ''
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}時間${m % 60}分`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function LiveListScreen({ onWatchLive, onOpenPerformer, initialTab = 'list' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [live, setLive] = useState<Performer[]>([])
  const [rank, setRank] = useState<LiveRankRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [liveRows, rankRows] = await Promise.all([listLivePerformers(), listLiveRanking()])
        if (cancelled) return
        setLive(liveRows)
        setRank(rankRows)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 8000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <>
      <h1 className="pl-h1">LIVE</h1>
      <p className="pl-muted">いま配信中のパフォーマー。タップですぐ視聴できます。</p>

      <div className="pl-live-tabs">
        <button type="button" className="pl-live-tabs__btn" data-active={tab === 'list'} onClick={() => setTab('list')}>
          一覧 {live.length > 0 ? `(${live.length})` : ''}
        </button>
        <button type="button" className="pl-live-tabs__btn" data-active={tab === 'rank'} onClick={() => setTab('rank')}>
          ランキング
        </button>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}
      {loading ? <p className="pl-muted">Loading…</p> : null}

      {!loading && tab === 'list' ? (
        live.length === 0 ? (
          <div className="pl-empty">いま配信中のライブはありません。</div>
        ) : (
          live.map((p) => (
            <button
              key={p.id}
              type="button"
              className="pl-card pl-row pl-live-row"
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => onWatchLive(p.id)}
            >
              <Avatar url={p.photo_url} name={p.stage_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pl-live-row__top">
                  <LiveBadge />
                  <span className="pl-muted">{liveDuration(p.live_started_at)}</span>
                </div>
                <div style={{ fontWeight: 700 }}>{p.stage_name}</div>
                <div className="pl-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.live_title || p.genre || p.city || 'ライブ配信中'}
                </div>
              </div>
            </button>
          ))
        )
      ) : null}

      {!loading && tab === 'rank' ? (
        rank.length === 0 ? (
          <div className="pl-empty">ランキング対象のライブがありません。</div>
        ) : (
          rank.map((row, i) => (
            <button
              key={row.performer.id}
              type="button"
              className="pl-card pl-row pl-live-row"
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => onWatchLive(row.performer.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onOpenPerformer(row.performer.id)
              }}
            >
              <div className="pl-rank-num" data-top={i < 3}>
                {i + 1}
              </div>
              <Avatar url={row.performer.photo_url} name={row.performer.stage_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pl-live-row__top">
                  <LiveBadge />
                  <span className="pl-muted">👁 {row.viewer_peak}</span>
                </div>
                <div style={{ fontWeight: 700 }}>{row.performer.stage_name}</div>
                <div className="pl-muted">
                  投げ銭 {formatYen(row.tip_amount_total)} · {row.tip_count}件
                </div>
              </div>
            </button>
          ))
        )
      ) : null}
    </>
  )
}
