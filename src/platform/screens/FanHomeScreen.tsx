import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, Bell, ChevronRight, MapPin, Play, Radio, Search } from 'lucide-react'
import { BrandLogo } from '../../brand/BrandLogo'
import { InstallPrompt } from '../components/InstallPrompt'
import { GlobalMessageBar } from '../components/GlobalMessageBar'
import { AWP_EVENT_SLUG } from '../../app/routes'
import { PUBLIC_EVENT_META } from '../../festival/data/public/eventMeta'
import {
  getFeaturedEvent,
  listEventLineup,
  listFollowedPerformers,
  listLivePerformers,
  listOshiPerformers,
  searchPerformers,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useTrackView } from '../lib/track'
import { useLang } from '../../i18n/LangProvider'
import type { Performer } from '../lib/types'
import { useRefreshTask } from '../lib/pullToRefresh'
import './fanHome.css'

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

export function FanHomeScreen({ onOpenPerformer, onWatchLive, onOpenSearch, onOpenLiveList, onOpenMap, onOpenEvent, onOpenNotifications, onPerformerLive, onPerformerSchedule, onPerformerDesk, onOpenTitle }: FanHomeProps) {
  const { user } = useAuth()
  const { t } = useLang()
  useTrackView('home_view')
  const [live, setLive] = useState<Performer[]>([])
  const [roster, setRoster] = useState<Performer[]>([])
  const [followed, setFollowed] = useState<Performer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventLabel, setEventLabel] = useState({ date: PUBLIC_EVENT_META.dateLabel, place: PUBLIC_EVENT_META.placeLabel, slug: 'award-winning-performers-2026' })
  const load = useCallback(async () => { const [liveRows, allRows, event] = await Promise.all([listLivePerformers(), searchPerformers(''), getFeaturedEvent()]); if (event) { setEventLabel({ date: event.date_label, place: event.place_label, slug: event.slug }); const lineup = await listEventLineup(event.id).catch((): string[] => []); setRoster(lineup.length ? allRows.filter((p) => lineup.includes(p.id)) : allRows) } else setRoster(allRows); setLive(liveRows); if (user) { const favorites = await listOshiPerformers(user.id).catch(() => []); setFollowed(favorites.length ? favorites : await listFollowedPerformers(user.id).catch(() => [])) } else setFollowed([]); setError(null); setLoading(false) }, [user])
  useRefreshTask(load)

  useEffect(() => {
    let cancelled = false
    void load()
      .catch(() => setError(t('homeLoadError')))
      .finally(() => { if (!cancelled) setLoading(false) })
    const timer = window.setInterval(() => void load().catch(() => undefined), 12000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [load, t, user])

  const hero = live[0] ?? followed[0] ?? roster[0] ?? null
  const recommendations = useMemo(() => {
    const seen = new Set<string>()
    return [...live, ...roster].filter((performer) => {
      if (seen.has(performer.id)) return false
      seen.add(performer.id)
      return true
    }).slice(0, 10)
  }, [live, roster])
  const upcoming = useMemo(() => roster.filter((performer) => !performer.is_live).slice(0, 8), [roster])

  return (
    <main className="pl-experience pl-home-v7">
      <header className="pl-home-v7__masthead">
        <button type="button" className="pl-home-v7__identity" onClick={onOpenTitle} aria-label={t('openTitleScreen')}><BrandLogo size={42} variant="official" /></button>
        <div className="pl-home-v7__tools">
          <button type="button" className="pl-icon-button" onClick={onOpenSearch} aria-label={t('searchAria')}><Search size={19} /></button>
          <button type="button" className="pl-icon-button" onClick={onOpenNotifications} aria-label={t('notifications')}><Bell size={19} /></button>
        </div>
      </header>

      <GlobalMessageBar />

      <nav className="pl-home-v7__channels" aria-label={t('homeChannels')}>
        <button type="button" data-active="true" onClick={onOpenLiveList}>{t('navLive')}</button>
        <button type="button" onClick={onOpenSearch}>{t('homeRecommend')}</button>
        <button type="button" onClick={onOpenMap}>{t('homeNear')}</button>
        <button type="button" onClick={onOpenSearch}>{t('homeNew')}</button>
      </nav>

      {loading ? (
        <section className="pl-cinema-hero pl-cinema-hero--loading" aria-label={t('homeLoading')} aria-busy="true">
          <div className="pl-cinema-hero__skeleton" aria-hidden="true"><span /><span /><span /></div>
        </section>
      ) : hero ? (
        <section className={`pl-cinema-hero${hero.is_live ? ' pl-cinema-hero--live' : ''}`} style={{ '--hero-image': hero.photo_url ? `url(${hero.photo_url})` : 'none' } as CSSProperties} aria-labelledby="pl-home-hero-title">
          <div className="pl-cinema-hero__ambient" aria-hidden="true" />
          <div className="pl-cinema-hero__media" aria-hidden="true">{!hero.photo_url ? <span>{hero.stage_name.slice(0, 2)}</span> : null}</div>
          <div className="pl-cinema-hero__scrim" aria-hidden="true" />
          <div className="pl-cinema-hero__content">
            <h1 className="pl-sr-only">{hero.stage_name}</h1>
            <div className="pl-cinema-hero__status"><span /> {hero.is_live ? 'LIVE' : 'FEATURED'}</div>
            <h2 id="pl-home-hero-title">{t('homeHero1')}<br />{t('homeHero2')}</h2>
            <button type="button" className="pl-cinema-hero__play" onClick={() => (hero.is_live ? onWatchLive(hero.id) : onOpenLiveList())} aria-label={hero.is_live ? t('homeWatchNamed', { name: hero.stage_name }) : t('homeFindLive')}><Play size={24} fill="currentColor" /></button>
            <div className="pl-cinema-hero__live-meta">
              <div className="pl-cinema-hero__avatars" aria-hidden="true">{(live.length ? live : recommendations).slice(0, 3).map((performer) => <span key={performer.id}>{performer.photo_url ? <img src={performer.photo_url} alt="" /> : performer.stage_name.slice(0, 1)}</span>)}</div>
              <p><strong>{live.length > 0 ? t('homeLiveCount', { n: live.length }) : t('homeNextLive')}</strong><small>{hero.stage_name} · {hero.genre || 'Performance'}</small></p>
              <ChevronRight size={18} />
            </div>
          </div>
        </section>
      ) : (
        <section className="pl-home-v7__empty">
          <div><p>DISCOVER</p><h1>{t('homeEmptyTitle')}</h1><span>{t('homeEmptyBody')}</span></div>
          <button type="button" className="pl-action pl-action--primary" onClick={onOpenSearch}><Search size={18} /> {t('homeSearch')}</button>
        </section>
      )}

      <PerformerRail title={t('homeFeatured')} eyebrow="FEATURED" performers={recommendations} onOpen={onOpenPerformer} onWatch={onWatchLive} onSeeAll={onOpenSearch} />
      <PerformerRail title={t('homeFollowingRail')} eyebrow="YOUR PEOPLE" performers={followed} onOpen={onOpenPerformer} onWatch={onWatchLive} onSeeAll={onOpenSearch} />
      <PerformerRail title={t('homeUpcoming')} eyebrow="UP NEXT" performers={upcoming} onOpen={onOpenPerformer} onWatch={onWatchLive} onSeeAll={onOpenMap} />

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
