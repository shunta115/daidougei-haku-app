import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { LiveBadge } from '../components/LiveBadge'
import { listLivePerformers, listLiveRanking, getFeaturedEvent, listEventSlots, listEventLiveSessions, listApprovedPerformers, type LiveRankRow, type EventSlotRow } from '../lib/api'
import { useLang } from '../../i18n/LangProvider'
import { GlobalMessageBar } from '../components/GlobalMessageBar'
import type { LiveSession, Performer } from '../lib/types'

type Props = {
  onWatchLive: (id: string) => void
  onOpenPerformer: (id: string) => void
}

function liveDuration(startedAt: string | null) {
  if (!startedAt) return ''
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
    if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function LiveListScreen({ onWatchLive, onOpenPerformer }: Props) {
  const { t } = useLang()
  const [live, setLive] = useState<Performer[]>([])
  const [rank, setRank] = useState<LiveRankRow[]>([])
  const [scheduled, setScheduled] = useState<EventSlotRow[]>([])
  const [ended, setEnded] = useState<LiveSession[]>([])
  const [acts, setActs] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const suggestions = acts.slice(0, 4)
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
          const [slots, sessions] = await Promise.all([
            listEventSlots(featured.id).catch(() => [] as EventSlotRow[]),
            listEventLiveSessions(featured.id).catch(() => [] as LiveSession[]),
          ])
          if (cancelled) return
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
        if (!cancelled) setError(e instanceof Error ? e.message : t('liveLoadError'))
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
  }, [t])

  return (
    <main className="pl-experience pl-live-hub">
      <header className="pl-page-intro"><p>LIVE STAGE</p><h1>{t('liveTitle')}</h1><span>{t('liveLead')}</span></header>
      <GlobalMessageBar />

      {error ? <p className="pl-error">{error}</p> : null}
      {loading ? <p className="pl-muted">{t('processing')}</p> : null}

      {!loading ? (
        <>
        {live.length === 0 ? (
          <section className="pl-live-empty-next" aria-label={t('liveNextAria')}>
            <p className="pl-live-empty-next__k">{t('liveNextKicker')}</p>
            <h2>{t('liveNextTitle')}</h2>
            <p>{t('liveNextBody')}</p>
            {suggestions[0] ? (
              <div className="pl-live-empty-next__actions">
                <button type="button" className="pl-btn pl-btn--block" onClick={() => onOpenPerformer(suggestions[0].id)}>
                  {t('liveSeeFeatured')}
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          (rank.length > 0 ? rank : live.map((performer) => ({ performer, viewer_peak: 0 }))).map((row) => (
            <button
              key={row.performer.id}
              type="button"
              className="pl-card pl-row pl-live-row"
              style={{
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                ...(row.performer.photo_url
                  ? {
                      backgroundImage: `linear-gradient(90deg, rgba(5,8,10,0.92) 32%, rgba(5,8,10,0.55)), url(${row.performer.photo_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : {}),
              }}
              onClick={() => onWatchLive(row.performer.id)}
            >
              <Avatar url={row.performer.photo_url} name={row.performer.stage_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pl-live-row__top">
                  <LiveBadge />
                  <span className="pl-muted">{liveDuration(row.performer.live_started_at)}{row.viewer_peak > 0 ? ` · 👁 ${row.viewer_peak}` : ''}</span>
                </div>
                <div style={{ fontWeight: 700 }}>{row.performer.stage_name}</div>
                <div className="pl-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.performer.live_title || row.performer.genre || row.performer.city || t('liveNow')}
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
        ) : live.length === 0 && suggestions.length > 0 ? (
          <div className="pl-live-suggest-grid" role="list">
            {suggestions.map((p) => (
              <button key={p.id} type="button" className="pl-live-suggest-card" role="listitem" onClick={() => onOpenPerformer(p.id)}>
                {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span aria-hidden="true">{p.stage_name.slice(0, 2)}</span>}
                <strong>{p.stage_name}</strong>
                <small>{p.genre || p.city || 'Performance'}</small>
              </button>
            ))}
          </div>
        ) : live.length === 0 ? (
          <p className="pl-muted">{t('liveFindFromActs')}</p>
        ) : null}
        {ended.some((session) => Boolean(session.stream_url)) ? (
          <details className="pl-live-archive">
            <summary>{t('endedLives')} <span>{ended.filter((session) => Boolean(session.stream_url)).length}</span></summary>
            {ended.filter((session) => Boolean(session.stream_url)).slice(0, 6).map((s) => {
              const act = acts.find((p) => p.id === s.performer_id)
              return (
                <a key={s.id} className="pl-live-archive__row" href={s.stream_url ?? undefined} target="_blank" rel="noopener noreferrer">
                  <span><strong>{s.title || act?.stage_name || t('liveArchive')}</strong><small>{act?.stage_name ?? t('liveArchiveAct')} · {t('mapViewers', { n: s.viewer_peak })}</small></span>
                  <em>{t('livePlay')}</em>
                </a>
              )
            })}
          </details>
        ) : null}
        </>
      ) : null}
    </main>
  )
}
