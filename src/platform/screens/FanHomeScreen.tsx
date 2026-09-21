import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, Eye, MapPin, Play, Radio, Search, Share2, Sparkles, UserRound } from 'lucide-react'
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
  onTip: (id: string) => void
}

function shareApp() {
  const url = window.location.origin
  const title = '大道芸博'
  const text = '街は、ステージになる。大道芸博のLIVEを無料で楽しもう。'
  if (navigator.share) {
    void navigator.share({ title, text, url }).catch(() => undefined)
    return
  }
  void navigator.clipboard?.writeText(url)
}

function PerformerRail({ title, eyebrow, performers, onOpen, onWatch }: {
  title: string
  eyebrow: string
  performers: Performer[]
  onOpen: (id: string) => void
  onWatch: (id: string) => void
}) {
  if (performers.length === 0) return null
  return (
    <section className="pl-cinema-section" aria-label={title}>
      <header className="pl-cinema-section__head"><div><p>{eyebrow}</p><h2>{title}</h2></div></header>
      <div className="pl-cinema-rail" role="list">
        {performers.map((performer) => (
          <article key={performer.id} className="pl-cinema-card" role="listitem">
            <button type="button" className="pl-cinema-card__media" onClick={() => (performer.is_live ? onWatch(performer.id) : onOpen(performer.id))} aria-label={`${performer.stage_name}を見る`}>
              {performer.photo_url ? <img src={performer.photo_url} alt="" loading="lazy" /> : <span>{performer.stage_name.slice(0, 2)}</span>}
              <span className="pl-cinema-card__shade" aria-hidden="true" />
              {performer.is_live ? <em><Radio size={12} /> LIVE</em> : null}
              <span className="pl-cinema-card__play"><Play size={18} fill="currentColor" /></span>
            </button>
            <button type="button" className="pl-cinema-card__body" onClick={() => onOpen(performer.id)}>
              <strong>{performer.stage_name}</strong>
              <small>{[performer.genre, performer.city].filter(Boolean).join(' · ') || 'Performance'}</small>
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export function FanHomeScreen({ onOpenPerformer, onWatchLive, onOpenSearch, onOpenLiveList, onOpenMap, onTip }: FanHomeProps) {
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
        <div><p className="pl-home-v7__brand">大道芸博</p><p className="pl-home-v7__tagline">街は、ステージになる。</p></div>
        <button type="button" className="pl-icon-button" onClick={() => shareApp()} aria-label="シェア"><Share2 size={19} /></button>
      </header>

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
            <div className="pl-cinema-hero__status">{hero.is_live ? <><span /> LIVE NOW · {live.length}組が配信中</> : <><Sparkles size={14} /> FEATURED</>}</div>
            <h1 id="pl-home-hero-title">{hero.stage_name}</h1>
            <p className="pl-cinema-hero__meta">{[hero.genre, hero.city, hero.country].filter(Boolean).join(' · ') || 'Street Performance'}</p>
            <p className="pl-cinema-hero__lead">{hero.is_live ? (hero.live_title || 'いま、この瞬間のパフォーマンスを無料で。') : '次の好きなパフォーマーを見つけよう。'}</p>
            <div className="pl-cinema-hero__actions">
              <button type="button" className="pl-action pl-action--primary" onClick={() => (hero.is_live ? onWatchLive(hero.id) : onOpenPerformer(hero.id))}>
                {hero.is_live ? <><Play size={18} fill="currentColor" /> 無料でLIVEを見る</> : <><Eye size={18} /> プロフィールを見る</>}
              </button>
              <button type="button" className="pl-action pl-action--glass" onClick={() => onOpenPerformer(hero.id)}><UserRound size={18} /> プロフィール</button>
            </div>
            <button type="button" className="pl-cinema-hero__support" onClick={() => onTip(hero.id)}>この人を応援する</button>
          </div>
        </section>
      ) : (
        <section className="pl-home-v7__empty">
          <div><p>DISCOVER</p><h1>まだ知らない才能に会いにいこう。</h1><span>公開されたパフォーマーや開催情報から、次に見る人を探せます。</span></div>
          <button type="button" className="pl-action pl-action--primary" onClick={onOpenSearch}><Search size={18} /> 探す</button>
        </section>
      )}

      <section className="pl-now-strip" aria-label="LIVE案内">
        <button type="button" onClick={onOpenLiveList}>
          <span className="pl-now-strip__icon"><Radio size={19} /></span>
          <span><small>LIVE NOW</small><strong>{live.length > 0 ? `${live.length}組が配信中` : '次のLIVEをチェック'}</strong></span>
          <ArrowRight size={19} />
        </button>
      </section>

      <PerformerRail title={lang === 'ja' ? 'いま配信中' : 'Live now'} eyebrow="FREE LIVE" performers={live.slice(1)} onOpen={onOpenPerformer} onWatch={onWatchLive} />
      <PerformerRail title={lang === 'ja' ? 'フォロー中' : 'Following'} eyebrow="YOUR PEOPLE" performers={followed} onOpen={onOpenPerformer} onWatch={onWatchLive} />
      <PerformerRail title={lang === 'ja' ? 'あなたへのおすすめ' : 'For you'} eyebrow="DISCOVER" performers={recommendations} onOpen={onOpenPerformer} onWatch={onWatchLive} />
      <PerformerRail title={lang === 'ja' ? 'まもなく出演' : 'Coming up'} eyebrow="UP NEXT" performers={upcoming} onOpen={onOpenPerformer} onWatch={onWatchLive} />

      <section className="pl-event-glass" aria-label="イベント">
        <div><p>DAIDOUGEI HAKU 2026</p><h2>{eventLabel.date || '10.10-10.12'}</h2><span><MapPin size={14} /> {eventLabel.place || '会場情報'}</span></div>
        <button type="button" className="pl-action pl-action--glass" onClick={onOpenMap}>MAP・予定を見る <ArrowRight size={17} /></button>
      </section>
      {error ? <p className="pl-error" role="status">{error}</p> : null}
    </main>
  )
}
