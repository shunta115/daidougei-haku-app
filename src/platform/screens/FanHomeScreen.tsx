import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Bell, ChevronRight, Heart, MapPin, Play, Radio, Search } from 'lucide-react'
import { BrandLogo } from '../../brand/BrandLogo'
import { InstallPrompt } from '../components/InstallPrompt'
import { GlobalMessageBar } from '../components/GlobalMessageBar'
import { AWP_EVENT_SLUG } from '../../app/routes'
import { PUBLIC_EVENT_META } from '../../festival/data/public/eventMeta'
import {
  getFeaturedEvent,
  getTodayOfficialNavigator,
  listUpcomingLiveSchedules,
  listUpcomingPublishedAppearances,
  listOwnLiveReservationIds,
  liveReservationsEnabled,
  listFollowedPerformers,
  listLivePerformers,
  listOshiPerformers,
  searchPerformers,
  type OfficialNavigator,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useTrackView } from '../lib/track'
import { useLang } from '../../i18n/LangProvider'
import type { LiveSchedule, PerformerAppearance, Performer } from '../lib/types'
import { HomeStage } from '../components/home/HomeStage'
import { homeDiscovery, type HomeSession } from '../lib/homeDiscovery'
import { listHomeSessions } from '../lib/homeDiscoveryApi'
import './fanHome.css'
import './homeStage.css'

type FanHomeProps = {
  onOpenPerformer: (id: string) => void
  onWatchLive: (id: string) => void
  onOpenSearch: () => void
  onOpenLiveList: () => void
  onOpenMap: () => void
  onOpenEvent?: (slug: string) => void
  onOpenNotifications: () => void
  onTip: (id: string) => void
  onPerformerLive?: () => void
  onPerformerSchedule?: () => void
  onPerformerDesk?: () => void
  onOpenTitle?: () => void
}

function PerformerRail({ title, eyebrow, performers, onOpen, onWatch, onSeeAll }: {
  title: string
  eyebrow: string
  performers: Performer[]
  onOpen: (id: string) => void
  onWatch: (id: string) => void
  onSeeAll: () => void
}) {
  const { t } = useLang()
  if (performers.length === 0) return null
  return (
    <section className="pl-cinema-section" aria-label={title}>
      <header className="pl-cinema-section__head">
        <div><p>{eyebrow}</p><h2>{title}</h2></div>
        <button type="button" onClick={onSeeAll}>{t('seeAll')} <ChevronRight size={15} /></button>
      </header>
      <div className="pl-cinema-rail" role="list">
        {performers.map((performer) => (
          <article key={performer.id} className="pl-cinema-card" role="listitem">
            <button type="button" className="pl-cinema-card__media" onClick={() => (performer.is_live ? onWatch(performer.id) : onOpen(performer.id))} aria-label={t('watchPerson', { name: performer.stage_name })}>
              {performer.photo_url ? <img src={performer.photo_url} alt="" loading="lazy" /> : <span>{performer.stage_name.slice(0, 2)}</span>}
              <span className="pl-cinema-card__shade" aria-hidden="true" />
              {performer.is_live ? <em><Radio size={12} /> LIVE</em> : null}
              <span className="pl-cinema-card__copy"><strong>{performer.stage_name}</strong><small>{performer.genre || 'Performance'}</small><small>{performer.is_live ? t('watchFree') : performer.city || t('eventSeeProfile')}</small></span>
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function OfficialNavigatorCard({ navigator, onOpen, onWatch, onTip }: {
  navigator: OfficialNavigator
  onOpen: (id: string) => void
  onWatch: (id: string) => void
  onTip: (id: string) => void
}) {
  const performer = navigator.performer
  const status = navigator.live_status === 'live' ? '🔴 LIVE配信中' : navigator.live_status === 'ended' ? '配信終了' : '配信準備中'
  return (
    <section className="pl-navigator" aria-labelledby="official-navigator-title">
      <header>
        <p>OFFICIAL NAVIGATOR</p>
        <h2 id="official-navigator-title">🎙️ オフィシャルナビゲーター</h2>
        <span>会場案内MC｜はじめての方はこちら！</span>
      </header>
      <div className="pl-navigator__person">
        <button type="button" className="pl-navigator__avatar" onClick={() => onOpen(performer.id)} aria-label={`${performer.stage_name}のプロフィール`}>
          {performer.photo_url ? <img src={performer.photo_url} alt="" /> : <span>{performer.stage_name.slice(0, 2)}</span>}
        </button>
        <div><strong>{performer.stage_name}</strong><span data-live={performer.is_live}>{status}</span></div>
      </div>
      <div className="pl-navigator__actions">
        <button type="button" className="pl-action pl-action--primary" disabled={!performer.is_live} onClick={() => onWatch(performer.id)}>
          <Play size={17} fill="currentColor" /> {performer.is_live ? '無料でLIVEを見る' : status}
        </button>
        <button type="button" className="pl-action pl-navigator__profile" onClick={() => onOpen(performer.id)}>プロフィール</button>
        <button type="button" className="pl-action pl-navigator__cheer" onClick={() => onTip(performer.id)}>
          <Heart size={17} fill="currentColor" aria-hidden="true" /> 応援する
        </button>
      </div>
    </section>
  )
}

export function FanHomeScreen({ onOpenPerformer, onWatchLive, onOpenSearch, onOpenLiveList, onOpenMap, onOpenEvent, onOpenNotifications, onTip, onPerformerLive, onPerformerSchedule, onPerformerDesk, onOpenTitle }: FanHomeProps) {
  const { user } = useAuth()
  const { t } = useLang()
  const userId = user?.id ?? null
  const loadError = t('homeLoadError')
  const latestUserId = useRef(userId)
  useEffect(() => { latestUserId.current = userId }, [userId])
  useTrackView('home_view')
  const [schedules, setSchedules] = useState<LiveSchedule[]>([])
  const [appearances, setAppearances] = useState<PerformerAppearance[]>([])
  const [sessions, setSessions] = useState<HomeSession[]>([])
  const reservationRevision = useRef(0)
  const [reserved, setReserved] = useState<string[] | null>(null)
  const [reservationOwner, setReservationOwner] = useState(userId)
  const [checkedAt, setCheckedAt] = useState(() => Date.now())
  const [live, setLive] = useState<Performer[]>([])
  const [roster, setRoster] = useState<Performer[]>([])
  const [followed, setFollowed] = useState<Performer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [navigator, setNavigator] = useState<OfficialNavigator | null>(null)
  const [eventLabel, setEventLabel] = useState({ date: PUBLIC_EVENT_META.dateLabel, place: PUBLIC_EVENT_META.placeLabel, slug: 'award-winning-performers-2026' })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let partialError = false
      const revision = reservationRevision.current
      const [liveRows, allRows, event, scheduleRows, appearanceRows, sessionRows, reservationIds] = await Promise.all([
        listLivePerformers(), searchPerformers(''), getFeaturedEvent().catch(() => null),
        liveReservationsEnabled ? listUpcomingLiveSchedules().catch(() => { partialError = true; return [] as LiveSchedule[] }) : Promise.resolve([] as LiveSchedule[]),
        listUpcomingPublishedAppearances().catch(() => { partialError = true; return [] as PerformerAppearance[] }),
        listHomeSessions().catch(() => { partialError = true; return [] as HomeSession[] }),
        liveReservationsEnabled && userId ? listOwnLiveReservationIds(userId).catch(() => null) : Promise.resolve([] as string[]),
      ])
      if (cancelled) return
      if (event) {
        setEventLabel({ date: event.date_label, place: event.place_label, slug: event.slug })
        const officialNavigator = await getTodayOfficialNavigator(event.id).catch(() => null)
        if (!cancelled) setRoster(allRows)
        if (!cancelled) setNavigator(officialNavigator)
      } else { setRoster(allRows); setNavigator(null) }
      if (cancelled) return
      setLive(liveRows); setSchedules(scheduleRows); setAppearances(appearanceRows); setSessions(sessionRows); if (revision === reservationRevision.current) { setReserved(reservationIds); setReservationOwner(userId) }; setCheckedAt(Date.now())
      if (userId) {
        const favorites = await listOshiPerformers(userId).catch(() => [])
        const follows = favorites.length ? favorites : await listFollowedPerformers(userId).catch(() => [])
        if (!cancelled) setFollowed(follows)
      } else setFollowed([])
      setError(partialError ? '一部の配信・予定情報を確認できません。時間をおいて再度確認してください。' : null)
    }
    let inFlight = false
    const refresh = async () => {
      if (document.hidden || inFlight) return
      inFlight = true
      try { await load() } catch { if (!cancelled) { setLive([]); setSessions([]); setError(loadError) } }
      finally { inFlight = false; if (!cancelled) setLoading(false) }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh) }
  }, [loadError, userId])

  const feed = useMemo(() => homeDiscovery(roster, live, schedules, appearances, sessions, checkedAt), [roster, live, schedules, appearances, sessions, checkedAt])

  return (
    <main className="pl-experience pl-home-v7">
      <header className="pl-home-v7__masthead">
        <button type="button" className="pl-home-v7__identity" onClick={onOpenTitle} aria-label={t('openTitleScreen')} title="タイトル画面へ戻る"><BrandLogo size={42} variant="official" /></button>
        <div className="pl-home-v7__tools">
          <button type="button" className="pl-icon-button" onClick={onOpenSearch} aria-label={t('searchAria')}><Search size={19} /></button>
          <button type="button" className="pl-icon-button" onClick={onOpenNotifications} aria-label={t('notifications')}><Bell size={19} /></button>
        </div>
      </header>

      {loading ? <section className="pl-cinema-hero pl-cinema-hero--loading" aria-label={t('homeLoading')} aria-busy="true"><p>ステージを確認しています…</p></section> : <HomeStage feed={feed} reserved={reservationOwner === userId ? reserved : null} setReserved={ids => { if (latestUserId.current !== userId) return; reservationRevision.current += 1; setReserved(ids); setReservationOwner(userId) }} key={userId ?? 'guest'} userId={userId} onWatch={onWatchLive} onProfile={onOpenPerformer} onTip={onTip} onSearch={onOpenSearch} />}
      <GlobalMessageBar />

      <nav className="pl-home-v7__channels" aria-label={t('homeChannels')}>
        <button type="button" data-active="true" onClick={onOpenLiveList}>{t('navLive')}</button>
        <button type="button" onClick={onOpenSearch}>{t('homeRecommend')}</button>
        <button type="button" onClick={onOpenMap}>{t('homeNear')}</button>
        <button type="button" onClick={onOpenSearch}>{t('homeNew')}</button>
      </nav>


      {navigator ? <OfficialNavigatorCard navigator={{...navigator, live_status: feed.live.some(p => p.id === navigator.performer.id) ? 'live' : 'preparing', performer: {...navigator.performer, is_live: feed.live.some(p => p.id === navigator.performer.id)}}} onOpen={onOpenPerformer} onWatch={onWatchLive} onTip={onTip} /> : null}
      <PerformerRail title={t('homeFollowingRail')} eyebrow="YOUR PEOPLE" performers={followed.map(p => ({...p, is_live: feed.live.some(l => l.id === p.id)}))} onOpen={onOpenPerformer} onWatch={onWatchLive} onSeeAll={onOpenSearch} />

      {onPerformerLive && onPerformerSchedule && onPerformerDesk ? (
        <section className="pl-performer-desk" aria-label={t('performerDeskTitle')}>
          <p>PERFORMER</p>
          <h2>{t('performerDeskTitle')}</h2>
          <span>{t('performerDeskLead')}</span>
          <div className="pl-performer-desk__row">
            <button type="button" className="pl-action pl-action--glass" onClick={onPerformerLive}>{t('performerDeskLive')}</button>
            <button type="button" className="pl-action pl-action--glass" onClick={onPerformerSchedule}>{t('performerDeskSchedule')}</button>
          </div>
          <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" onClick={onPerformerDesk}>{t('performerManageTitle')}</button>
        </section>
      ) : null}

      <InstallPrompt />

      <section className="pl-event-glass" aria-label={t('eventHome')}>
        <div>
          <p>AWP 2026</p>
          <h2>{t('eventName')}</h2>
          <span>{t('presenter')}</span>
          <strong className="pl-event-glass__date">{eventLabel.date || PUBLIC_EVENT_META.dateLabel}</strong>
          <span><MapPin size={14} /> {eventLabel.slug === AWP_EVENT_SLUG ? t('awpPlace') : (eventLabel.place || t('homeVenue'))}</span>
        </div>
        <button
          type="button"
          className="pl-action pl-action--glass"
          onClick={() => (onOpenEvent ? onOpenEvent(eventLabel.slug || AWP_EVENT_SLUG) : onOpenMap())}
        >
          {t('homeMapCta')} <ArrowRight size={17} />
        </button>
      </section>
      {error ? <p className="pl-error" role="status">{error}</p> : null}
    </main>
  )
}
