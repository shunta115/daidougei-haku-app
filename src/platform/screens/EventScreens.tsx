import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Clock3, Gift, Heart, Image, MapPin, Radio, Sparkles, Ticket, Trophy, Vote, X } from 'lucide-react'
import {
  getEventBySlug,
  getEventVoteRule,
  getMyVotes,
  listEventLineupPerformers,
  listEventGuestAppearances,
  listVotingEligibleEventLineupPerformers,
  listEventSlots,
  listEventVenues,
  listPublishedEvents,
  listVoteRankingNamed,
  voteForPerformer,
  type EventSlotRow,
  type EventGuestAppearanceRow,
  type EventVenueRow,
  type EventVoteRule,
  type FeaturedEvent,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import type { Performer } from '../lib/types'
import { AwpHeroVoteLaunch, EventVoteDesk } from './EventVoteDesk'
import './event.css'

type DetailProps = {
  slug: string
  onBack: () => void
  onOpenPerformer: (id: string) => void
  onWatchLive: (id: string) => void
  onTip: (id: string) => void
  onOpenMap: () => void
  onOpenVote?: () => void
  onRequireAuth: () => void
}

function dateKey(value: string | null | undefined) {
  return String(value ?? '').slice(0, 10)
}

function timeKey(value: string) {
  return String(value || '').slice(0, 5)
}

function nowJst() {
  const now = new Date()
  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(now),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now),
  }
}

function slotState(slot: EventSlotRow, clock: { date: string; time: string }) {
  const date = dateKey(slot.date)
  if (date < clock.date || (date === clock.date && timeKey(slot.end_time) <= clock.time)) return '終了'
  if (date === clock.date && timeKey(slot.start_time) <= clock.time && clock.time < timeKey(slot.end_time)) return '開催中'
  if (date === clock.date) {
    const start = new Date(`${date}T${timeKey(slot.start_time)}:00+09:00`).getTime()
    const minutes = Math.ceil((start - Date.now()) / 60_000)
    if (minutes >= 0 && minutes <= 30) return `あと${minutes}分`
  }
  return '予定'
}

function slotTimestamps(slot: EventSlotRow) {
  const date = dateKey(slot.date)
  return {
    start: new Date(`${date}T${timeKey(slot.start_time)}:00+09:00`).getTime(),
    end: new Date(`${date}T${timeKey(slot.end_time)}:00+09:00`).getTime(),
  }
}

function liveTimingLabel(slot: EventSlotRow, now = Date.now()) {
  const { start, end } = slotTimestamps(slot)
  if (end <= now) return '終了'
  if (start <= now) return `出演中・あと${Math.max(0, Math.ceil((end - now) / 60_000))}分`
  const minutes = Math.ceil((start - now) / 60_000)
  return minutes <= 180 ? `あと${minutes}分` : '予定'
}

function compactEventDate(event: FeaturedEvent) {
  const parse = (value: string | null | undefined) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey(value))
    if (!match) return null
    return { month: Number(match[2]), day: Number(match[3]) }
  }
  const from = parse(event.starts_on)
  const to = parse(event.ends_on)
  if (from && to) {
    if (from.month === to.month && from.day === to.day) return `${from.month}/${from.day}`
    if (from.month === to.month) return `${from.month}/${from.day}〜${to.day}`
    return `${from.month}/${from.day}〜${to.month}/${to.day}`
  }
  return event.date_label
}

function eventFactLines(event: FeaturedEvent, place: string, admission: string | undefined) {
  return [compactEventDate(event), event.hours_label, place, admission].map((line) => String(line ?? '').trim()).filter(Boolean)
}

const AWP_SLUG = 'award-winning-performers-2026'

function accentThrees(text: string) {
  return text.split(/(3)/).map((part, index) => (
    part === '3' ? <em key={index} className="pl-event-hero__accent">3</em> : part
  ))
}

function eventChrome(event: FeaturedEvent, translate: (key: 'eventName' | 'presenter' | 'awpPlace' | 'awpAdmission') => string) {
  if (event.slug === AWP_SLUG) {
    return {
      name: translate('eventName'),
      presenter: translate('presenter'),
      place: translate('awpPlace'),
      admission: translate('awpAdmission'),
    }
  }
  return {
    name: event.name_ja,
    presenter: event.presenter_ja,
    place: event.place_label,
    admission: event.admission_label,
  }
}

const AWP_FLYER_SRC = '/events/award-winning-performers-2026/official-flyer-2026.webp'
const AWP_HERO_SRC = AWP_FLYER_SRC

type EventPhase = 'before' | 'during' | 'after'

function eventPhase(event: FeaturedEvent, today: string): EventPhase {
  if (event.status === 'archived' || (event.ends_on && today > dateKey(event.ends_on))) return 'after'
  if (event.starts_on && today < dateKey(event.starts_on)) return 'before'
  return 'during'
}

function daysUntil(date: string | null | undefined) {
  if (!date) return null
  const start = new Date(`${dateKey(date)}T00:00:00+09:00`).getTime()
  return Math.max(0, Math.ceil((start - Date.now()) / 86_400_000))
}

export function EventListScreen({ onOpen }: { onOpen: (slug: string) => void }) {
  const { t } = useLang()
  const [events, setEvents] = useState<FeaturedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listPublishedEvents().then(setEvents).catch(() => setError(t('eventLoadError'))).finally(() => setLoading(false))
  }, [t])
  return <main className="pl-event-index">
    <header className="pl-event-index__head"><p>HAKU EVENTS</p><h1>{t('eventListTitle')}</h1><span>{t('eventListLead')}</span></header>
    {loading ? <p role="status">{t('eventLoading')}</p> : null}
    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {!loading && !error && events.length === 0 ? <section className="pl-event-empty"><CalendarDays size={30} /><h2>{t('eventEmptyTitle')}</h2><p>{t('eventEmptyBody')}</p></section> : null}
    <div className="pl-event-index__list">
      {events.map((event) => {
        const chrome = eventChrome(event, t)
        return <article className="pl-event-card" key={event.id} data-archived={event.status === 'archived'}>
        <div className="pl-event-card__visual" data-flyer={event.slug === 'award-winning-performers-2026' ? 'true' : undefined}>
          {event.slug === 'award-winning-performers-2026' ? <img src={AWP_FLYER_SRC} alt={t('eventFlyerAlt', { name: chrome.name })} /> : <strong>AWP</strong>}
          <span>{event.status === 'archived' ? 'ARCHIVE' : '2026 EVENT'}</span>
        </div>
        <div className="pl-event-card__body"><p>{chrome.presenter}</p><h2>{chrome.name}</h2><ul className="pl-event-facts">{eventFactLines(event, chrome.place, chrome.admission).map((line) => <li key={line}>{line}</li>)}</ul><button type="button" onClick={() => onOpen(event.slug)}>{t('eventEnjoy')}<ChevronRight size={18} /></button></div>
      </article>
      })}
    </div>
  </main>
}

export function EventDetailScreen({ slug, onBack, onOpenPerformer, onWatchLive, onTip, onOpenMap, onOpenVote, onRequireAuth }: DetailProps) {
  const { t } = useLang()
  const { user, profile } = useAuth()
  const [event, setEvent] = useState<FeaturedEvent | null>(null)
  const [venues, setVenues] = useState<EventVenueRow[]>([])
  const [slots, setSlots] = useState<EventSlotRow[]>([])
  const [performers, setPerformers] = useState<Performer[]>([])
  const [guestAppearances, setGuestAppearances] = useState<EventGuestAppearanceRow[]>([])
  const [votingPerformers, setVotingPerformers] = useState<Performer[]>([])
  const [rule, setRule] = useState<EventVoteRule | null>(null)
  const [ranking, setRanking] = useState<Array<{ performer: Performer; votes: number }>>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [myVotes, setMyVotes] = useState<string[]>([])
  const [voteComplete, setVoteComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [flyerOpen, setFlyerOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [focusedVenue, setFocusedVenue] = useState<string | null>(null)
  const [wantedSlots, setWantedSlots] = useState<string[]>([])
  const [clock, setClock] = useState(nowJst)

  useEffect(() => {
    const timer = window.setInterval(() => setClock(nowJst()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previous = meta?.getAttribute('content')
    meta?.setAttribute('content', '#050505')
    return () => { if (previous) meta?.setAttribute('content', previous) }
  }, [])

  useEffect(() => {
    if (slug !== AWP_SLUG) return
    const imageUrl = new URL(AWP_FLYER_SRC, window.location.origin).toString()
    const metas = [
      document.querySelector<HTMLMetaElement>('meta[property="og:image"]'),
      document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]'),
    ].filter((meta): meta is HTMLMetaElement => Boolean(meta))
    const previous = metas.map((meta) => meta.content)
    metas.forEach((meta) => { meta.content = imageUrl })
    return () => metas.forEach((meta, index) => { meta.content = previous[index] })
  }, [slug])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const nextEvent = await getEventBySlug(slug)
        if (!nextEvent) throw new Error('not-found')
        const [venueRows, slotRows, lineup, eligibleLineup, guestRows, voteRule, results] = await Promise.all([
          listEventVenues(nextEvent.id), listEventSlots(nextEvent.id), listEventLineupPerformers(nextEvent.id),
          listVotingEligibleEventLineupPerformers(nextEvent.id),
          listEventGuestAppearances(nextEvent.id).catch(() => []),
          getEventVoteRule(nextEvent.id).catch(() => null), listVoteRankingNamed(nextEvent.id).catch(() => []),
        ])
        if (!active) return
        setEvent(nextEvent); setVenues(venueRows); setSlots(slotRows); setPerformers(lineup); setVotingPerformers(eligibleLineup); setGuestAppearances(guestRows); setRule(voteRule); setRanking(results)
        const dates = [...new Set(slotRows.map((slot) => dateKey(slot.date)))]
        const fallbackDate = dateKey(nextEvent.starts_on) || dates[0] || clock.date
        setSelectedDate(dates.includes(clock.date) ? clock.date : fallbackDate)
        try {
          const saved = JSON.parse(localStorage.getItem(`haku:wanted-slots:${nextEvent.id}`) || '[]')
          setWantedSlots(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === 'string') : [])
        } catch { setWantedSlots([]) }
        if (user) setMyVotes(await getMyVotes(nextEvent.id, user.id).catch(() => []))
        const key = `pl-event-guide:${slug}`
        setGuideOpen(Boolean(nextEvent.guide_enabled) && localStorage.getItem(key) !== '1')
      } catch {
        if (active) setError(t('eventDetailError'))
      } finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [slug, t, user])

  const performerById = useMemo(() => new Map(performers.map((performer) => [performer.id, performer])), [performers])
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues])
  const dates = useMemo(() => {
    const values = [...new Set(slots.map((slot) => dateKey(slot.date)))]
    if (values.length) return values
    if (event?.starts_on && event.ends_on) {
      const out: string[] = []; const cursor = new Date(`${event.starts_on}T00:00:00+09:00`); const end = new Date(`${event.ends_on}T00:00:00+09:00`)
      while (cursor <= end) { out.push(cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })); cursor.setDate(cursor.getDate() + 1) }
      return out
    }
    return []
  }, [event, slots])
  const dateSlots = useMemo(() => slots.filter((slot) => dateKey(slot.date) === selectedDate).sort((a, b) => timeKey(a.start_time).localeCompare(timeKey(b.start_time))), [selectedDate, slots])
  const regularDateSlots = dateSlots.filter((slot) => slot.performance_type !== 'special_final')
  const current = regularDateSlots.find((slot) => slotState(slot, clock) === '開催中')
  const next = regularDateSlots.filter((slot) => slotTimestamps(slot).start > Date.now()).sort((a, b) => slotTimestamps(a).start - slotTimestamps(b).start)[0]
  const watchNow = regularDateSlots
    .filter((slot) => slotTimestamps(slot).end > Date.now())
    .sort((a, b) => slotTimestamps(a).start - slotTimestamps(b).start)
    .slice(0, 3)
  const wantedToday = regularDateSlots.filter((slot) => wantedSlots.includes(slot.id))
  const resultsPublished = Boolean(event?.results_published_at && new Date(event.results_published_at).getTime() <= Date.now()) || event?.status === 'archived'
  const finalSlots = slots.filter((slot) => slot.performance_type === 'special_final').sort((a, b) => (a.ranking_position ?? 99) - (b.ranking_position ?? 99))
  const votingOpen = Boolean(rule?.voting_open && (!rule.voting_starts_at || Date.now() >= Date.parse(rule.voting_starts_at)) && (!rule.voting_ends_at || Date.now() < Date.parse(rule.voting_ends_at)))
  const phase = event ? eventPhase(event, clock.date) : 'before'
  const countdown = daysUntil(event?.starts_on)

  const castVote = async (performer: Performer) => {
    if (!user) { sessionStorage.setItem('pl-event-return', slug); onRequireAuth(); return }
    if (profile?.role !== 'fan') { setError(t('eventVoteFanOnly')); return }
    if (!event || !window.confirm(t('eventVoteConfirm', { name: performer.stage_name }))) return
    try {
      await voteForPerformer(event.id, performer.id, user.id)
      setMyVotes((currentVotes) => [...new Set([...currentVotes, performer.id])]); setVoteComplete(true); setError(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message.includes('daily_vote_limit') ? t('eventVoteLimit') : message.includes('voting_') ? t('eventVoteShut') : t('eventVoteFail'))
    }
  }

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const closeGuide = () => { localStorage.setItem(`pl-event-guide:${slug}`, '1'); setGuideOpen(false) }
  const openVenueMap = (venueId?: string | null) => { setFocusedVenue(venueId || null); setMapOpen(true) }
  const toggleWanted = (slotId: string) => {
    if (!event) return
    setWantedSlots((currentIds) => {
      const nextIds = currentIds.includes(slotId) ? currentIds.filter((id) => id !== slotId) : [...currentIds, slotId]
      localStorage.setItem(`haku:wanted-slots:${event.id}`, JSON.stringify(nextIds))
      return nextIds
    })
  }

  if (loading) return <p role="status">{t('eventPreparing')}</p>
  if (error && !event) return <main className="pl-event-detail"><button className="pl-event-back" onClick={onBack}><ArrowLeft size={18} />{t('eventBack')}</button><p className="pl-error">{error}</p></main>
  if (!event) return null
  const chrome = eventChrome(event, t)
  const renderSpot = (slot: EventSlotRow | undefined, label: string) => {
    if (!slot) return null
    const performer = slot.performer_id ? performerById.get(slot.performer_id) : null
    const venue = venueById.get(slot.venue_id)
    const displayName = performer?.stage_name || slot.performer_name_ja || (slot.performance_type === 'special_final' && slot.ranking_position ? `投票結果 ${slot.ranking_position}位` : slot.stage_ja || t('eventAdjusting'))
    return <article className="pl-event-now__item"><p>{label}</p><strong>{timeKey(slot.start_time)}〜{timeKey(slot.end_time)}</strong><h3>{displayName}</h3><span>{liveTimingLabel(slot)} · {venue?.name_ja || slot.stage_ja}</span><div>{performer?.is_live ? <button onClick={() => onWatchLive(performer.id)}><Radio size={16} />{t('eventWatchLive')}</button> : null}<button onClick={() => openVenueMap(slot.venue_id)}><MapPin size={16} />場所を見る</button>{performer ? <button onClick={() => onOpenPerformer(performer.id)}>プロフィール</button> : null}</div></article>
  }

  const isAwp = slug === AWP_SLUG
  const moreLabel = phase === 'during' ? t('eventSeeNow') : phase === 'after' ? t('eventSeeResults') : t('eventSeeSchedule')
  return <main className={`pl-event-detail${isAwp ? ' pl-event-detail--awp' : ''}`}>
    <button className="pl-event-back" onClick={onBack}><ArrowLeft size={18} />{t('eventBack')}</button>
    {isAwp ? (
      <section className="awp-fv">
        <div className="awp-fv__hero">
          <div className="awp-fv__copy">
            <div className="awp-fv__mark"><span>AWP</span><em>2026</em></div>
            <p>{chrome.presenter}</p>
            <h1>{chrome.name}</h1>
            <strong>{t('eventCopy')}</strong>
            <h2>{accentThrees(t('eventSub'))}</h2>
          </div>
          <div className="awp-fv__art" aria-hidden="true">
            <span className="awp-fv__halo" />
            <span className="awp-fv__figure"><img src={AWP_HERO_SRC} alt="" /></span>
          </div>
        </div>
        <AwpHeroVoteLaunch eventId={event.id} onOpenVote={() => (onOpenVote ? onOpenVote() : jump('event-vote'))} />
        <div className="awp-fv__meta">
          <ul>
            <li><CalendarDays size={15} aria-hidden="true" /><span>{[compactEventDate(event), event.hours_label].filter(Boolean).join('　')}</span></li>
            <li><MapPin size={15} aria-hidden="true" /><span>{chrome.place}</span></li>
            {chrome.admission ? <li><Ticket size={15} aria-hidden="true" /><span>{chrome.admission}</span></li> : null}
          </ul>
          {phase === 'before' && countdown !== null ? (
            <div className="awp-fv__count">
              <CalendarDays size={22} aria-hidden="true" />
              <span>{t('eventCountdownLead')}</span>
              <b>{countdown}</b>
              <small>{t('eventCountdownUnit')}</small>
            </div>
          ) : null}
        </div>
        <div className="awp-fv__cards">
          <button type="button" onClick={() => jump('event-schedule')}>
            <CalendarDays size={18} aria-hidden="true" />
            <span>{t('eventSeeSchedule')}</span>
            <span className="awp-fv__thumb awp-fv__thumb--sched" aria-hidden="true"><img src={AWP_HERO_SRC} alt="" /></span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setFlyerOpen(true)}>
            <span className="awp-fv__thumb awp-fv__thumb--flyer" aria-hidden="true"><img src={AWP_FLYER_SRC} alt="" /></span>
            <span>{t('eventFlyer')}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    ) : (
    <section className="pl-event-hero">
      <div className="pl-event-hero__mark"><span>AWP</span><em>2026</em></div>
      <p>{chrome.presenter}</p>
      <h1>{chrome.name}</h1>
      <strong>{event.main_copy_ja || t('eventCopy')}</strong>
      <h2>{event.sub_copy_ja || t('eventSub')}</h2>
      <ul className="pl-event-facts">{eventFactLines(event, chrome.place, chrome.admission).map((line) => <li key={line}>{line}</li>)}</ul>
      {phase === 'before' && countdown !== null ? <b className="pl-event-hero__countdown">{t('eventCountdown', { n: countdown })}</b> : null}
      <div className="pl-event-hero__more">
        <button type="button" onClick={() => jump('event-schedule')}>{moreLabel}</button>
        <button type="button" onClick={() => setFlyerOpen(true)}><Image size={16} />{t('eventFlyer')}</button>
      </div>
    </section>
    )}

    <nav className="pl-event-jump" aria-label={t('eventMenu')}><button onClick={() => jump('event-now')}>NOW</button><button onClick={() => jump('event-schedule')}>{t('eventJumpTime')}</button><button onClick={() => jump('event-vote')}>{t('eventJumpVote')}</button><button onClick={() => jump('event-lineup')}>{t('eventJumpActs')}</button><button onClick={() => openVenueMap()}>{t('mapTab')}</button></nav>

    {isAwp ? <div className="awp-day-tabs" role="tablist" aria-label="開催日">{dates.map((date) => <button role="tab" aria-selected={selectedDate === date} data-active={selectedDate === date} key={date} onClick={() => setSelectedDate(date)}>{date.slice(5).replace('-', '/')}</button>)}</div> : null}

    {isAwp ? <section className="pl-event-now awp-now" id="event-now"><header><p>WHAT'S ON NOW</p><h2>今、誰を観る？</h2><span>{selectedDate === clock.date ? '現在時刻から自動更新しています。' : `${selectedDate.slice(5).replace('-', '/')}の出演予定`}</span></header>{current || next ? <div>{renderSpot(current, '🔴 NOW / 現在出演中')}{renderSpot(next, '⏭ NEXT / 次に始まる出演')}</div> : <p className="pl-event-inline-empty">この日の通常ステージは終了しました。</p>}
      <details className="awp-wanted" open={wantedToday.length > 0}><summary><Heart size={17} />今日の観たい予定 <b>{wantedToday.length}</b></summary>{wantedToday.length ? <div>{wantedToday.map((slot) => <button key={slot.id} onClick={() => openVenueMap(slot.venue_id)}><time>{timeKey(slot.start_time)}</time><strong>{performerById.get(slot.performer_id || '')?.stage_name || slot.performer_name_ja || slot.stage_ja}</strong><span><MapPin size={13} />{venueById.get(slot.venue_id)?.name_ja || slot.stage_ja}</span></button>)}</div> : <p>タイムテーブルの「観たい」を押すと、ここにまとまります。</p>}</details>
    </section> : phase === 'during' ? <section className="pl-event-now" id="event-now"><header><p>RIGHT NOW</p><h2>{t('eventRightNow')}</h2></header>{current || next ? <div>{renderSpot(current, 'LIVE / NOW')}{renderSpot(next, 'NEXT')}</div> : <p className="pl-event-inline-empty">{t('eventRightNowEmpty')}</p>}</section> : phase === 'before' ? <section className="pl-event-pre" id="event-now"><CalendarDays size={24} /><div><p>BEFORE THE EVENT</p><h2>{countdown === 0 ? t('eventToday') : t('eventCountdown', { n: countdown ?? '—' })}</h2><span>{t('eventPreLead')}</span></div><button onClick={() => jump('event-lineup')}>{t('eventSeePerformers')}</button></section> : null}

    {isAwp ? <section className="awp-map-card" id="event-map"><header><MapPin size={20} /><div><p>会場MAP</p><h2>次のステージ、どこ？</h2></div></header><div>{venues.filter((venue) => venue.venue_type === 'stage' || /ステージ[1-4]/.test(venue.name_ja)).map((venue) => <button key={venue.id} onClick={() => openVenueMap(venue.id)}>{venue.name_ja}</button>)}</div><button className="awp-map-card__open" onClick={() => openVenueMap()}><Image size={17} />会場MAPを大きく見る</button></section> : null}

    {isAwp ? <section className="awp-watch-now"><header><Clock3 size={20} /><div><p>QUICK PICKS</p><h2>今から観られる！</h2></div></header>{watchNow.length ? <div>{watchNow.map((slot, index) => { const venue = venueById.get(slot.venue_id); const performer = slot.performer_id ? performerById.get(slot.performer_id) : null; return <article key={slot.id} data-state={slotState(slot, clock) === '開催中' ? 'live' : index === 0 ? 'soon' : 'next'}><span>{venue?.name_ja || slot.stage_ja}</span><strong>{performer?.stage_name || slot.performer_name_ja || slot.stage_ja}</strong><small>{timeKey(slot.start_time)} START · {liveTimingLabel(slot)}</small><button onClick={() => openVenueMap(slot.venue_id)}><MapPin size={14} />場所</button></article>})}</div> : <p className="pl-event-inline-empty">この日の出演は終了しました。</p>}</section> : null}

    {phase === 'during' ? <details className="pl-event-guide"><summary>{t('eventHowTo')}</summary><ol><li><em>10:00〜16:00</em><strong>{t('eventDayShow')}</strong></li><li><em>STEP 2</em><strong>{t('eventVoteStep')}</strong></li><li><em>16:00+</em><strong>{t('eventResults')}</strong></li><li><em>16:30〜19:00</em><strong>SPECIAL NIGHT</strong></li></ol></details> : null}

    <section className="pl-event-schedule" id="event-schedule"><header><p>TIMETABLE</p><h2>{t('eventTimetable')}</h2><span>{t('eventTimetableLead')}</span></header>{!isAwp ? <div className="pl-event-schedule__dates" role="tablist">{dates.map((date) => <button role="tab" aria-selected={selectedDate === date} data-active={selectedDate === date} key={date} onClick={() => setSelectedDate(date)}>{date.slice(5).replace('-', '/')}</button>)}</div> : null}{regularDateSlots.length === 0 ? <p className="pl-event-inline-empty">{t('eventDayEmpty')}</p> : regularDateSlots.map((slot) => { const performer = slot.performer_id ? performerById.get(slot.performer_id) : null; const venue = venueById.get(slot.venue_id); const displayName = performer?.stage_name || slot.performer_name_ja || slot.stage_ja || t('eventAdjusting'); const state = slotState(slot, clock); const stateLabel = selectedDate === clock.date ? liveTimingLabel(slot) : state === '終了' ? t('slotEnded') : t('slotPlanned'); const wanted = wantedSlots.includes(slot.id); return <article className="pl-event-slot" key={slot.id} data-live={state === '開催中'}><time>{timeKey(slot.start_time)}<small>{t('eventUntil', { time: timeKey(slot.end_time) })}</small></time><button disabled={!performer} onClick={() => performer && onOpenPerformer(performer.id)}>{performer?.photo_url ? <img src={performer.photo_url} alt="" /> : <span /> }<strong>{displayName}</strong><em>{performer?.genre || 'Performance'}</em></button><i>{stateLabel}</i><div className="pl-event-slot__actions"><button className="pl-event-slot__venue" onClick={() => openVenueMap(slot.venue_id)}><MapPin size={14} />{venue?.name_ja || slot.stage_ja}</button><button className="pl-event-slot__want" data-active={wanted} aria-pressed={wanted} onClick={() => toggleWanted(slot.id)}><Heart size={14} fill={wanted ? 'currentColor' : 'none'} />{wanted ? '観たい済み' : '観たい'}</button></div>{performer?.is_live && slot.is_stream ? <button className="pl-event-slot__live" onClick={() => onWatchLive(performer.id)}>{t('navLive')}</button> : null}</article>})}</section>

    {isAwp ? <section className="awp-special"><header><Trophy size={25} /><div><p>SPECIAL NIGHT</p><h2>あなたの一票で、夜のステージが決まる。</h2></div></header><div>{dateSlots.filter((slot) => slot.performance_type === 'special_final').sort((a, b) => timeKey(a.start_time).localeCompare(timeKey(b.start_time))).map((slot) => <article key={slot.id}><time>{timeKey(slot.start_time)}〜{timeKey(slot.end_time)}</time><strong>{slot.ranking_position === 3 ? '🥉' : slot.ranking_position === 2 ? '🥈' : '🥇'} 投票結果{slot.ranking_position}位</strong><span>{venueById.get(slot.venue_id)?.name_ja || slot.stage_ja}</span></article>)}</div>{votingOpen ? <button onClick={() => onOpenVote ? onOpenVote() : jump('event-vote')}><Vote size={17} />投票する</button> : <p className="awp-special__closed">投票受付前</p>}</section> : null}

    {isAwp ? <section className="pl-event-lineup-full awp-roving"><header><p>STATUE / ROVING</p><h2>会場を歩いて出会おう</h2><span>どこで会えるかは当日のお楽しみ。投票対象とは別のAWP公式出演です。</span></header><div>{guestAppearances.filter((row) => dateKey(row.appearance_date) === selectedDate).map((row) => { const linked = row.linked_performer_id ? performerById.get(row.linked_performer_id) : null; return <article key={row.id} onClick={() => linked && onOpenPerformer(linked.id)}><span>{linked?.photo_url ? <img src={linked.photo_url} alt="" /> : row.official_name_ja.slice(0, 2)}</span><h3>{linked?.stage_name || row.official_name_ja}</h3><p>{row.appearance_type === 'roving' ? '回遊パフォーマー' : row.appearance_type === 'statue' ? 'スタチューパフォーマー' : 'Statue Carnival / 回遊'}</p>{linked ? <button>{t('eventSeeProfile')}</button> : <small>公式出演者（プロフィール準備中）</small>}</article> })}</div></section> : null}

    {slug === AWP_SLUG ? <EventVoteDesk event={event} performers={votingPerformers} onOpenPerformer={onOpenPerformer} onOpenSchedule={() => jump('event-schedule')} onOpenMap={onOpenMap} /> : <section className="pl-event-vote" id="event-vote"><header><Vote size={25} /><p>{t('eventVoteKicker')}</p><h2>{t('eventVoteTitle')}</h2><span>{t('eventVoteBody')}</span></header>{voteComplete ? <div className="pl-event-vote__complete"><CheckCircle2 size={32} /><h3>{t('eventVoteDone')}</h3><p>{t('eventVoteDoneBody')}</p><button onClick={() => jump('event-schedule')}>{t('eventNextShow')}</button></div> : null}{!votingOpen ? <p className="pl-event-inline-empty">{t('eventVoteClosed')}</p> : null}{votingOpen && myVotes.length >= (rule?.votes_per_user_per_day ?? 1) ? <p className="pl-event-inline-empty">{t('eventVoteUsed')}</p> : null}<div className="pl-event-vote__grid">{votingPerformers.map((performer) => <article key={performer.id}>{performer.photo_url ? <img src={performer.photo_url} alt="" /> : <span className="pl-event-vote__avatar">{performer.stage_name.slice(0, 2)}</span>}<h3>{performer.stage_name}</h3><p>{performer.awards || performer.genre || 'Performance'}</p><div><button onClick={() => onOpenPerformer(performer.id)}>{t('eventProfile')}</button><button disabled={!votingOpen || myVotes.includes(performer.id) || myVotes.length >= (rule?.votes_per_user_per_day ?? 1)} onClick={() => void castVote(performer)}>{myVotes.includes(performer.id) ? t('voted') : t('vote')}</button></div></article>)}</div></section>}

    {!isAwp ? <section className="pl-event-night"><Trophy size={28} /><p>SPECIAL NIGHT</p><h2>{resultsPublished ? t('eventNightSet') : t('eventNightOpen')}</h2>{resultsPublished && ranking.length ? ranking.slice(0, 3).map((row, index) => { const slot = finalSlots.find((item) => item.ranking_position === index + 1); return <article key={row.performer.id}><strong>{t('eventRank', { n: index + 1 })}</strong>{row.performer.photo_url ? <img src={row.performer.photo_url} alt="" /> : null}<span><b>{row.performer.stage_name}</b><small>{slot ? `${timeKey(slot.start_time)}〜${timeKey(slot.end_time)} · ${venueById.get(slot.venue_id)?.name_ja || slot.stage_ja}` : t('eventTimePending')}</small></span><button onClick={() => onOpenPerformer(row.performer.id)}>{t('eventProfile')}</button>{row.performer.is_live ? <button onClick={() => onWatchLive(row.performer.id)}>{t('navLive')}</button> : null}</article> }) : <p>{t('eventNoRank')}</p>}</section> : null}

    <section className="pl-event-lineup-full" id="event-lineup"><header><p>PERFORMERS</p><h2>{t('eventLineup')}</h2><span>{t('eventLineupLead')}</span></header><div>{performers.map((performer) => <article key={performer.id} onClick={() => onOpenPerformer(performer.id)}>{performer.photo_url ? <img src={performer.photo_url} alt="" /> : <span>{performer.stage_name.slice(0, 2)}</span>}<h3>{performer.stage_name}</h3><p>{performer.genre || 'Performance'}</p>{performer.is_live ? <em>{t('navLive')}</em> : null}<button>{t('eventSeeProfile')}</button></article>)}</div></section>

    {!isAwp ? <section className="pl-event-map"><MapPin size={26} /><p>EXPLORE</p><h2>{t('eventWhere')}</h2><span>{t('eventWhereLead')}</span><div>{venues.map((venue) => <button key={venue.id} onClick={onOpenMap}><strong>{venue.name_ja}</strong><small>{venue.venue_type === 'food' ? t('eventFood') : venue.blurb_ja || t('eventSeeSchedule')}</small><ChevronRight size={18} /></button>)}</div><button className="pl-event-map__cta" onClick={onOpenMap}><MapPin size={17} />{t('eventOpenMap')}</button></section> : null}

    <section className="pl-event-support"><Gift size={26} /><p>SUPPORT</p><h2>{t('eventSupportTitle')}</h2><span>{t('eventSupportBody')}</span>{myVotes[0] ? <button onClick={() => onTip(myVotes[0])}>{t('eventSupportVoted')}</button> : <button onClick={() => jump('event-lineup')}>{t('eventSupportPick')}</button>}</section>

    {guideOpen ? <div className="pl-event-onboarding" role="dialog" aria-modal="true" aria-labelledby="event-onboarding-title"><div><Sparkles size={28} /><p>{t('eventWelcomeKicker')}</p><h2 id="event-onboarding-title">{t('eventWelcomeTitle')}</h2><span>{event.sub_copy_ja || t('eventSub')}</span><ul><li>{t('eventGuide1')}</li><li>{t('eventGuide2')}</li><li>{t('eventGuide3')}</li><li>{t('eventGuide4')}</li></ul><button onClick={closeGuide}>{t('eventWelcomeCta')}</button></div></div> : null}
    {mapOpen ? <div className="awp-map-modal" role="dialog" aria-modal="true" aria-label="AWP 2026 公式会場MAP"><button className="awp-map-modal__close" onClick={() => setMapOpen(false)} aria-label="閉じる"><X size={22} /></button><div><header><MapPin size={20} /><span><b>{focusedVenue ? venueById.get(focusedVenue)?.name_ja || '会場MAP' : 'AWP 2026 公式会場MAP'}</b><small>公式会場図で場所を確認してください</small></span></header><img src="/events/award-winning-performers-2026/official-venue-map.jpg" alt="AWP 2026 公式会場内マップ" /><p>{focusedVenue ? `選択中：${venueById.get(focusedVenue)?.name_ja || ''}` : 'ステージ1〜4の位置を公式会場図で確認できます。'} 未確定の緯度経度は使用していません。</p></div></div> : null}
    {flyerOpen ? <div className="pl-event-flyer" role="dialog" aria-modal="true" aria-label={t('eventFlyerDialog')}><button className="pl-event-flyer__close" type="button" onClick={() => setFlyerOpen(false)} aria-label={t('eventClose')}><X size={22} /></button><div className="pl-event-flyer__stage"><img src={AWP_FLYER_SRC} alt={t('eventFlyerImage')} /></div></div> : null}
  </main>
}
