import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { LiveBadge } from '../components/LiveBadge'
import { listLivePerformers, listLiveRanking, getFeaturedEvent, listVoteRankingNamed, listEventSlots, listEventLiveSessions, listApprovedPerformers, type LiveRankRow, type EventSlotRow } from '../lib/api'
import { useLang } from '../../i18n/LangProvider'
import type { LiveSession, Performer } from '../lib/types'

type Tab = 'list' | 'rank' | 'votes'

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
  const { t } = useLang()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [live, setLive] = useState<Performer[]>([])
  const [rank, setRank] = useState<LiveRankRow[]>([])
  const [votes, setVotes] = useState<Array<{ performer: Performer; votes: number }>>([])
  const [scheduled, setScheduled] = useState<EventSlotRow[]>([])
  const [ended, setEnded] = useState<LiveSession[]>([])
  const [acts, setActs] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [liveRows, rankRows, featured, approved] = await Promise.all([
          listLivePerformers(),
          listLiveRanking(),
          getFeaturedEvent().catch(() => null),
          listApprovedPerformers().catch(() => [] as Performer[]),
        ])
        if (cancelled) return
        setLive(liveRows)
        setRank(rankRows)
        setActs(approved)
        if (featured) {
          const [voteRows, slots, sessions] = await Promise.all([
            listVoteRankingNamed(featured.id).catch(() => []),
            listEventSlots(featured.id).catch(() => [] as EventSlotRow[]),
            listEventLiveSessions(featured.id).catch(() => [] as LiveSession[]),
          ])
          if (cancelled) return
          setVotes(voteRows)
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
          setScheduled(
            slots.filter(
              (s) => s.is_stream && String(s.date).slice(0, 10) >= today && s.status !== 'cancelled',
            ),
          )
          setEnded(sessions.filter((s) => Boolean(s.ended_at)))
        }
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
      <p className="pl-muted">{t('liveListLead')}</p>

      <div className="pl-live-tabs">
        <button type="button" className="pl-live-tabs__btn" data-active={tab === 'list'} onClick={() => setTab('list')}>
          {t('liveList')} {live.length > 0 ? `(${live.length})` : ''}
        </button>
        <button type="button" className="pl-live-tabs__btn" data-active={tab === 'rank'} onClick={() => setTab('rank')}>
          {t('liveRanking')}
        </button>
        <button type="button" className="pl-live-tabs__btn" data-active={tab === 'votes'} onClick={() => setTab('votes')}>
          {t('votes')}
        </button>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}
      {loading ? <p className="pl-muted">Loading…</p> : null}

      {!loading && tab === 'list' ? (
        <>
        {live.length === 0 ? (
          <div className="pl-empty">{t('noLiveNow')}</div>
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
                  {p.live_title || p.genre || p.city || t('liveNow')}
                </div>
              </div>
            </button>
          ))
        )}
        {scheduled.length > 0 ? (
          <>
            <h2 className="pl-h1" style={{ fontSize: '1.1rem', marginTop: 20 }}>{t('streamSlot')}</h2>
            {scheduled.map((s) => {
              const act = acts.find((p) => p.id === s.performer_id)
              return (
                <button
                  key={s.id}
                  type="button"
                  className="pl-card"
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => (s.performer_id ? onOpenPerformer(s.performer_id) : undefined)}
                >
                  <div className="pl-muted">{t('liveScheduled')}</div>
                  <div style={{ fontWeight: 700 }}>{act?.stage_name ?? s.performer_id}</div>
                  <div className="pl-muted">
                    {s.date} {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                  </div>
                </button>
              )
            })}
          </>
        ) : live.length === 0 ? (
          <p className="pl-muted">{t('comingSoonSchedule')}</p>
        ) : null}
        {ended.length > 0 ? (
          <>
            <h2 className="pl-h1" style={{ fontSize: '1.1rem', marginTop: 20 }}>{t('endedLives')}</h2>
            {ended.slice(0, 8).map((s) => {
              const act = acts.find((p) => p.id === s.performer_id)
              return (
                <div key={s.id} className="pl-card">
                  <div className="pl-muted">{t('liveEnded')}</div>
                  <div style={{ fontWeight: 700 }}>{act?.stage_name ?? s.performer_id}</div>
                  <div className="pl-muted">
                    {s.title || '—'} · 👁 {s.viewer_peak}
                  </div>
                </div>
              )
            })}
          </>
        ) : null}
        </>
      ) : null}

      {!loading && tab === 'rank' ? (
        rank.length === 0 ? (
          <div className="pl-empty">{t('noLiveNow')}</div>
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
                  応援 {row.tip_count}件 · 視聴ピーク {row.viewer_peak}
                </div>
              </div>
            </button>
          ))
        )
      ) : null}

      {!loading && tab === 'votes' ? (
        votes.length === 0 ? (
          <div className="pl-empty">{t('noVotesYet')}</div>
        ) : (
          votes.map((row, i) => (
            <button
              key={row.performer.id}
              type="button"
              className="pl-card pl-row pl-live-row"
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => onOpenPerformer(row.performer.id)}
            >
              <div className="pl-rank-num" data-top={i < 3}>
                {i + 1}
              </div>
              <Avatar url={row.performer.photo_url} name={row.performer.stage_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{row.performer.stage_name}</div>
                <div className="pl-muted">{row.votes}票</div>
              </div>
            </button>
          ))
        )
      ) : null}
    </>
  )
}
