import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, Bell, ChevronRight, MapPin, Play, Radio, Search } from 'lucide-react'
import { BrandLogo } from '../../brand/BrandLogo'
import { InstallPrompt } from '../components/InstallPrompt'
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
import './fanHome.css'

type FanHomeProps = {
  onOpenPerformer: (id: string) => void
  onWatchLive: (id: string) => void
  onOpenSearch: () => void
  onOpenLiveList: () => void
  onOpenMap: () => void
  onOpenNotifications: () => void
  onTip: (id: string) => void
}

function PerformerRail({ title, eyebrow, performers, onOpen, onWatch, onSeeAll }: {
  title: string
  eyebrow: string
  performers: Performer[]
  onOpen: (id: string) => void
  onWatch: (id: string) => void
  onSeeAll: () => void
}) {
  if (performers.length === 0) return null
  return (
    <section className="pl-cinema-section" aria-label={title}>
      <header className="pl-cinema-section__head">
        <div><p>{eyebrow}</p><h2>{title}</h2></div>
        <button type="button" onClick={onSeeAll}>すべて見る <ChevronRight size={15} /></button>
      </header>
      <div className="pl-cinema-rail" role="list">
        {performers.map((performer) => (
          <article key={performer.id} className="pl-cinema-card" role="listitem">
            <button type="button" className="pl-cinema-card__media" onClick={() => (performer.is_live ? onWatch(performer.id) : onOpen(performer.id))} aria-label={`${performer.stage_name}を見る`}>
              {performer.photo_url ? <img src={performer.photo_url} alt="" loading="lazy" /> : <span>{performer.stage_name.slice(0, 2)}</span>}
              <span className="pl-cinema-card__shade" aria-hidden="true" />
              {performer.is_live ? <em><Radio size={12} /> LIVE</em> : null}
              <span className="pl-cinema-card__copy"><strong>{performer.stage_name}</strong><small>{performer.genre || 'Performance'}</small><small>{performer.is_live ? '無料で視聴' : performer.city || 'プロフィールを見る'}</small></span>
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export function FanHomeScreen({ onOpenPerformer, onWatchLive, onOpenSearch, onOpenLiveList, onOpenMap, onOpenNotifications }: FanHomeProps) {
  const { user } = useAuth()
  const { lang } = useLang()
  useTrackView('home_view')
  const [live, setLive] = useState<Performer[]>([])
  const [roster, setRoster] = useState<Performer[]>([])
  const [followed, setFollowed] = useState<Performer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventLabel, setEventLabel] = useState({ date: PUBLIC_EVENT_META.dateLabel, place: PUBLIC_EVENT_META.placeLabel })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [liveRows, allRows, event] = await Promise.all([listLivePerformers(), searchPerformers(''), getFeaturedEvent()])
      if (cancelled) return
      if (event) {
        setEventLabel({ date: event.date_label, place: event.place_label })
        const lineup = await listEventLineup(event.id).catch((): string[] => [])
        if (!cancelled) setRoster(lineup.length ? allRows.filter((p) => lineup.includes(p.id)) : allRows)
      } else setRoster(allRows)
      setLive(liveRows)
      if (user) {
        const favorites = await listOshiPerformers(user.id).catch(() => [])
        const follows = favorites.length ? favorites : await listFollowedPerformers(user.id).catch(() => [])
        if (!cancelled) setFollowed(follows)
      } else setFollowed([])
      setError(null)
    }
    void load()
      .catch(() => setError('パフォーマー情報を読み込めませんでした。通信を確認して、もう一度開いてください。'))
      .finally(() => { if (!cancelled) setLoading(false) })
    const timer = window.setInterval(() => void load().catch(() => undefined), 12000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [user])

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
        <div className="pl-home-v7__identity"><span><BrandLogo size={20} /></span><p className="pl-home-v7__brand">大道芸博</p></div>
        <div className="pl-home-v7__tools">
          <button type="button" className="pl-icon-button" onClick={onOpenSearch} aria-label="パフォーマーを検索"><Search size={19} /></button>
          <button type="button" className="pl-icon-button" onClick={onOpenNotifications} aria-label="通知"><Bell size={19} /></button>
        </div>
      </header>

      <nav className="pl-home-v7__channels" aria-label="ホームの表示カテゴリ">
        <button type="button" data-active="true" onClick={onOpenLiveList}>LIVE</button>
        <button type="button" onClick={onOpenSearch}>おすすめ</button>
        <button type="button" onClick={onOpenMap}>近く</button>
        <button type="button" onClick={onOpenSearch}>新着</button>
      </nav>

      {loading ? (
        <section className="pl-cinema-hero pl-cinema-hero--loading" aria-label="パフォーマーを読み込み中" aria-busy="true">
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
            <h2 id="pl-home-hero-title">今、ここで生まれる<br />特別な時間。</h2>
            <button type="button" className="pl-cinema-hero__play" onClick={() => (hero.is_live ? onWatchLive(hero.id) : onOpenLiveList())} aria-label={hero.is_live ? `${hero.stage_name}のLIVEを見る` : 'LIVEを探す'}><Play size={24} fill="currentColor" /></button>
            <div className="pl-cinema-hero__live-meta">
              <div className="pl-cinema-hero__avatars" aria-hidden="true">{(live.length ? live : recommendations).slice(0, 3).map((performer) => <span key={performer.id}>{performer.photo_url ? <img src={performer.photo_url} alt="" /> : performer.stage_name.slice(0, 1)}</span>)}</div>
              <p><strong>{live.length > 0 ? `${live.length}組がLIVE配信中` : '次のLIVEをチェック'}</strong><small>{hero.stage_name} · {hero.genre || 'Performance'}</small></p>
              <ChevronRight size={18} />
            </div>
          </div>
        </section>
      ) : (
        <section className="pl-home-v7__empty">
          <div><p>DISCOVER</p><h1>まだ知らない才能に会いにいこう。</h1><span>公開されたパフォーマーや開催情報から、次に見る人を探せます。</span></div>
          <button type="button" className="pl-action pl-action--primary" onClick={onOpenSearch}><Search size={18} /> 探す</button>
        </section>
      )}

      <PerformerRail title={lang === 'ja' ? '注目のパフォーマー' : 'Featured performers'} eyebrow="FEATURED" performers={recommendations} onOpen={onOpenPerformer} onWatch={onWatchLive} onSeeAll={onOpenSearch} />
      <PerformerRail title={lang === 'ja' ? 'フォロー中' : 'Following'} eyebrow="YOUR PEOPLE" performers={followed} onOpen={onOpenPerformer} onWatch={onWatchLive} onSeeAll={onOpenSearch} />
      <PerformerRail title={lang === 'ja' ? 'まもなく出演' : 'Coming up'} eyebrow="UP NEXT" performers={upcoming} onOpen={onOpenPerformer} onWatch={onWatchLive} onSeeAll={onOpenMap} />

      <InstallPrompt />

      <section className="pl-event-glass" aria-label="イベント">
        <div><p>DAIDOUGEI HAKU 2026</p><h2>{eventLabel.date || '10.10-10.12'}</h2><span><MapPin size={14} /> {eventLabel.place || '会場情報'}</span></div>
        <button type="button" className="pl-action pl-action--glass" onClick={onOpenMap}>MAP・予定を見る <ArrowRight size={17} /></button>
      </section>
      {error ? <p className="pl-error" role="status">{error}</p> : null}
    </main>
  )
}
