import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Gift, MapPin, Radio, Sparkles, Trophy, Vote } from 'lucide-react'
import {
  getEventBySlug,
  getEventVoteRule,
  getMyVotes,
  listEventLineupPerformers,
  listEventSlots,
  listEventVenues,
  listPublishedEvents,
  listVoteRankingNamed,
  voteForPerformer,
  type EventSlotRow,
  type EventVenueRow,
  type EventVoteRule,
  type FeaturedEvent,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Performer } from '../lib/types'
import './event.css'

type DetailProps = {
  slug: string
  onBack: () => void
  onOpenPerformer: (id: string) => void
  onWatchLive: (id: string) => void
  onTip: (id: string) => void
  onOpenMap: () => void
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

function eventDateLabel(event: FeaturedEvent) {
  return [event.date_label, event.hours_label, event.place_label, event.admission_label].filter(Boolean).join(' · ')
}

export function EventListScreen({ onOpen }: { onOpen: (slug: string) => void }) {
  const [events, setEvents] = useState<FeaturedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listPublishedEvents().then(setEvents).catch(() => setError('イベントを読み込めませんでした。通信を確認して、もう一度お試しください。')).finally(() => setLoading(false))
  }, [])
  return <main className="pl-event-index">
    <header className="pl-event-index__head"><p>HAKU EVENTS</p><h1>街で生まれる熱狂へ。</h1><span>今日どこで誰が出演するか、イベントごとにすぐ確認できます。</span></header>
    {loading ? <p role="status">イベントを確認しています…</p> : null}
    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {!loading && !error && events.length === 0 ? <section className="pl-event-empty"><CalendarDays size={30} /><h2>公開中のイベントはありません</h2><p>次のイベントが決まり次第、ここでお知らせします。</p></section> : null}
    <div className="pl-event-index__list">
      {events.map((event) => <article className="pl-event-card" key={event.id} data-archived={event.status === 'archived'}>
        <div className="pl-event-card__visual"><span>{event.status === 'archived' ? 'ARCHIVE' : '2026 EVENT'}</span><strong>AWP</strong></div>
        <div className="pl-event-card__body"><p>{event.presenter_ja}</p><h2>{event.name_ja}</h2><span>{eventDateLabel(event)}</span><button type="button" onClick={() => onOpen(event.slug)}>イベントを楽しむ<ChevronRight size={18} /></button></div>
      </article>)}
    </div>
  </main>
}

export function EventDetailScreen({ slug, onBack, onOpenPerformer, onWatchLive, onTip, onOpenMap, onRequireAuth }: DetailProps) {
  const { user, profile } = useAuth()
  const [event, setEvent] = useState<FeaturedEvent | null>(null)
  const [venues, setVenues] = useState<EventVenueRow[]>([])
  const [slots, setSlots] = useState<EventSlotRow[]>([])
  const [performers, setPerformers] = useState<Performer[]>([])
  const [rule, setRule] = useState<EventVoteRule | null>(null)
  const [ranking, setRanking] = useState<Array<{ performer: Performer; votes: number }>>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [myVotes, setMyVotes] = useState<string[]>([])
  const [voteComplete, setVoteComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const clock = nowJst()

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const nextEvent = await getEventBySlug(slug)
        if (!nextEvent) throw new Error('not-found')
        const [venueRows, slotRows, lineup, voteRule, results] = await Promise.all([
          listEventVenues(nextEvent.id), listEventSlots(nextEvent.id), listEventLineupPerformers(nextEvent.id),
          getEventVoteRule(nextEvent.id).catch(() => null), listVoteRankingNamed(nextEvent.id).catch(() => []),
        ])
        if (!active) return
        setEvent(nextEvent); setVenues(venueRows); setSlots(slotRows); setPerformers(lineup); setRule(voteRule); setRanking(results)
        const dates = [...new Set(slotRows.map((slot) => dateKey(slot.date)))]
        const fallbackDate = dateKey(nextEvent.starts_on) || dates[0] || clock.date
        setSelectedDate(dates.includes(clock.date) ? clock.date : fallbackDate)
        if (user) setMyVotes(await getMyVotes(nextEvent.id, user.id).catch(() => []))
        const key = `pl-event-guide:${slug}`
        setGuideOpen(Boolean(nextEvent.guide_enabled) && localStorage.getItem(key) !== '1')
      } catch {
        if (active) setError('イベント情報を読み込めませんでした。URLまたは通信状態をご確認ください。')
      } finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [slug, user])

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
  const current = slots.find((slot) => slotState(slot, clock) === '開催中')
  const next = slots.filter((slot) => dateKey(slot.date) > clock.date || (dateKey(slot.date) === clock.date && timeKey(slot.start_time) > clock.time)).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))[0]
  const resultsPublished = Boolean(event?.results_published_at && new Date(event.results_published_at).getTime() <= Date.now()) || event?.status === 'archived'
  const finalSlots = slots.filter((slot) => slot.performance_type === 'special_final').sort((a, b) => (a.ranking_position ?? 99) - (b.ranking_position ?? 99))
  const votingOpen = Boolean(rule?.voting_open && (!rule.voting_starts_at || Date.now() >= Date.parse(rule.voting_starts_at)) && (!rule.voting_ends_at || Date.now() < Date.parse(rule.voting_ends_at)))

  const castVote = async (performer: Performer) => {
    if (!user) { sessionStorage.setItem('pl-event-return', slug); onRequireAuth(); return }
    if (profile?.role !== 'fan') { setError('投票はファンアカウントから参加できます。'); return }
    if (!event || !window.confirm(`${performer.stage_name}に投票しますか？`)) return
    try {
      await voteForPerformer(event.id, performer.id, user.id)
      setMyVotes((currentVotes) => [...new Set([...currentVotes, performer.id])]); setVoteComplete(true); setError(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message.includes('daily_vote_limit') ? '本日の投票上限に達しました。' : message.includes('voting_') ? '現在は投票を受け付けていません。' : '投票を受け付けられませんでした。通信を確認して、もう一度お試しください。')
    }
  }

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const closeGuide = () => { localStorage.setItem(`pl-event-guide:${slug}`, '1'); setGuideOpen(false) }

  if (loading) return <p role="status">イベントを準備しています…</p>
  if (error && !event) return <main className="pl-event-detail"><button className="pl-event-back" onClick={onBack}><ArrowLeft size={18} />イベント一覧</button><p className="pl-error">{error}</p></main>
  if (!event) return null
  const renderSpot = (slot: EventSlotRow | undefined, label: string) => {
    if (!slot) return <article className="pl-event-now__empty"><strong>{label}</strong><span>出演情報は確定後に表示します。</span></article>
    const performer = slot.performer_id ? performerById.get(slot.performer_id) : null
    const venue = venueById.get(slot.venue_id)
    return <article className="pl-event-now__item"><p>{label}</p><strong>{timeKey(slot.start_time)}〜{timeKey(slot.end_time)}</strong><h3>{performer?.stage_name || slot.stage_ja || '出演者調整中'}</h3><span>{venue?.name_ja || slot.stage_ja}</span><div>{performer?.is_live ? <button onClick={() => onWatchLive(performer.id)}><Radio size={16} />LIVEを見る</button> : null}<button onClick={onOpenMap}><MapPin size={16} />MAPで見る</button></div></article>
  }

  return <main className="pl-event-detail">
    <button className="pl-event-back" onClick={onBack}><ArrowLeft size={18} />イベント一覧</button>
    <section className="pl-event-hero"><div className="pl-event-hero__mark"><span>AWP</span><em>2026</em></div><p>{event.presenter_ja}</p><h1>{event.name_ja}</h1><strong>{event.hero_kicker_ja || '街で出会う、特別なパフォーマンス。'}</strong><h2>{event.main_copy_ja || '観る。見つける。応援する。'}</h2><span>{event.sub_copy_ja || '今日の出会いを、その日だけで終わらせない。'}</span><small>{eventDateLabel(event)}</small><div><button onClick={() => jump('event-schedule')}>今日の出演を見る</button><button onClick={() => jump('event-vote')}>投票する</button></div></section>

    <nav className="pl-event-jump" aria-label="イベント内メニュー"><button onClick={() => jump('event-now')}>NOW</button><button onClick={() => jump('event-schedule')}>時間割</button><button onClick={() => jump('event-vote')}>投票</button><button onClick={() => jump('event-lineup')}>出演者</button><button onClick={onOpenMap}>MAP</button></nav>

    <section className="pl-event-guide" aria-labelledby="event-guide-title"><p>HOW TO ENJOY</p><h2 id="event-guide-title">今日の楽しみ方</h2><ol><li><em>10:00〜16:00</em><strong>昼公演を楽しむ</strong></li><li><em>STEP 2</em><strong>心に残った人へ投票</strong></li><li><em>STEP 3</em><strong>観客投票で上位3組を選出</strong></li><li><em>16時以降</em><strong>結果発表</strong></li><li><em>16:30〜19:00</em><strong>SPECIAL NIGHT</strong></li></ol></section>

    <section className="pl-event-now" id="event-now"><header><p>RIGHT NOW</p><h2>いま観られる・次に始まる</h2></header><div>{renderSpot(current, 'LIVE / NOW')}{renderSpot(next, 'NEXT')}</div></section>

    <section className="pl-event-schedule" id="event-schedule"><header><p>TIMETABLE</p><h2>本日のタイムテーブル</h2><span>時間・場所・LIVEをまとめて確認</span></header><div className="pl-event-schedule__dates" role="tablist">{dates.map((date) => <button role="tab" aria-selected={selectedDate === date} data-active={selectedDate === date} key={date} onClick={() => setSelectedDate(date)}>{date.slice(5).replace('-', '/')}</button>)}</div>{dateSlots.length === 0 ? <p className="pl-event-inline-empty">この日の出演予定は確定後に表示します。</p> : dateSlots.map((slot) => { const performer = slot.performer_id ? performerById.get(slot.performer_id) : null; const venue = venueById.get(slot.venue_id); const state = slotState(slot, clock); return <article className="pl-event-slot" key={slot.id} data-live={state === '開催中'}><time>{timeKey(slot.start_time)}<small>{timeKey(slot.end_time)}まで</small></time><button disabled={!performer} onClick={() => performer && onOpenPerformer(performer.id)}>{performer?.photo_url ? <img src={performer.photo_url} alt="" /> : <span /> }<strong>{performer?.stage_name || slot.stage_ja || '出演者調整中'}</strong><em>{performer?.genre || (slot.performance_type === 'special_final' ? 'SPECIAL NIGHT' : 'Performance')}</em></button><button className="pl-event-slot__venue" onClick={onOpenMap}><MapPin size={14} />{venue?.name_ja || slot.stage_ja}</button><i>{state}</i>{performer?.is_live && slot.is_stream ? <button className="pl-event-slot__live" onClick={() => onWatchLive(performer.id)}>LIVE</button> : null}</article>})}</section>

    <section className="pl-event-vote" id="event-vote"><header><Vote size={25} /><p>YOUR VOTE</p><h2>今日いちばん心に残ったパフォーマーを選ぼう</h2><span>あなたの一票がSPECIAL NIGHTの出演者を決めます。投げ銭とは別の、出演者を選ぶ無料投票です。</span></header>{voteComplete ? <div className="pl-event-vote__complete"><CheckCircle2 size={32} /><h3>投票完了！</h3><p>あなたの一票を受け付けました。結果発表は16時以降！</p><button onClick={() => jump('event-schedule')}>次のパフォーマンスを見る</button></div> : null}{!votingOpen ? <p className="pl-event-inline-empty">投票受付時間になると、ここから投票できます。</p> : null}{votingOpen && myVotes.length >= (rule?.votes_per_user_per_day ?? 1) ? <p className="pl-event-inline-empty">本日の投票を受け付けました。結果発表をお待ちください。</p> : null}<div className="pl-event-vote__grid">{performers.map((performer) => <article key={performer.id}>{performer.photo_url ? <img src={performer.photo_url} alt="" /> : <span className="pl-event-vote__avatar">{performer.stage_name.slice(0, 2)}</span>}<h3>{performer.stage_name}</h3><p>{performer.awards || performer.genre || 'Performance'}</p><div><button onClick={() => onOpenPerformer(performer.id)}>プロフィール</button><button disabled={!votingOpen || myVotes.includes(performer.id) || myVotes.length >= (rule?.votes_per_user_per_day ?? 1)} onClick={() => void castVote(performer)}>{myVotes.includes(performer.id) ? '投票済み' : '投票する'}</button></div></article>)}</div></section>

    <section className="pl-event-night"><Trophy size={28} /><p>SPECIAL NIGHT</p><h2>{resultsPublished ? 'SPECIAL NIGHT 出演決定' : '観客投票で選ばれた3組が、夜のステージへ。'}</h2>{resultsPublished && ranking.length ? ranking.slice(0, 3).map((row, index) => { const slot = finalSlots.find((item) => item.ranking_position === index + 1); return <article key={row.performer.id}><strong>{index + 1}位</strong>{row.performer.photo_url ? <img src={row.performer.photo_url} alt="" /> : null}<span><b>{row.performer.stage_name}</b><small>{slot ? `${timeKey(slot.start_time)}〜${timeKey(slot.end_time)} · ${venueById.get(slot.venue_id)?.name_ja || slot.stage_ja}` : '出演時間は運営発表をご確認ください'}</small></span><button onClick={() => onOpenPerformer(row.performer.id)}>プロフィール</button>{row.performer.is_live ? <button onClick={() => onWatchLive(row.performer.id)}>LIVE</button> : null}</article> }) : <p>途中順位は公開しません。運営発表後に上位3組を表示します。</p>}</section>

    <section className="pl-event-lineup-full" id="event-lineup"><header><p>PERFORMERS</p><h2>出演パフォーマー</h2><span>気になる人を見つけたら、プロフィールからフォローしてイベント後もつながれます。</span></header><div>{performers.map((performer) => <article key={performer.id} onClick={() => onOpenPerformer(performer.id)}>{performer.photo_url ? <img src={performer.photo_url} alt="" /> : <span>{performer.stage_name.slice(0, 2)}</span>}<h3>{performer.stage_name}</h3><p>{performer.genre || 'Performance'}</p>{performer.is_live ? <em>LIVE</em> : null}<button>プロフィールを見る</button></article>)}</div></section>

    <section className="pl-event-map"><MapPin size={26} /><p>EXPLORE</p><h2>次はどこで観る？</h2><span>ステージや回遊エリアを確認して、次のパフォーマンスへ。</span><div>{venues.map((venue) => <button key={venue.id} onClick={onOpenMap}><strong>{venue.name_ja}</strong><small>{venue.venue_type === 'food' ? 'グルメ / キッチンカー' : venue.blurb_ja || '出演予定を見る'}</small><ChevronRight size={18} /></button>)}</div><button className="pl-event-map__cta" onClick={onOpenMap}><MapPin size={17} />MAPを開く</button></section>

    <section className="pl-event-support"><Gift size={26} /><p>SUPPORT</p><h2>最高だった！をその場で届けよう</h2><span>投票はSPECIAL NIGHTの出演者を選ぶもの。投げ銭はパフォーマー本人へ直接「ありがとう」を届ける応援です。</span>{myVotes[0] ? <button onClick={() => onTip(myVotes[0])}>投票したパフォーマーを応援する</button> : <button onClick={() => jump('event-lineup')}>応援したい人を選ぶ</button>}</section>

    {guideOpen ? <div className="pl-event-onboarding" role="dialog" aria-modal="true" aria-labelledby="event-onboarding-title"><div><Sparkles size={28} /><p>WELCOME TO HAKU</p><h2 id="event-onboarding-title">今日の大道芸を100%楽しむ</h2><ul><li>タイムテーブルを見る</li><li>今いる場所から出演者を探す</li><li>心に残った人に投票</li><li>投げ銭で直接応援</li><li>SPECIAL NIGHTの結果を見る</li></ul><button onClick={closeGuide}>無料で楽しむ</button></div></div> : null}
  </main>
}
