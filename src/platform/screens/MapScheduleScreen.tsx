import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Clock3, Map as MapIcon, Navigation, Radio, UserRound } from 'lucide-react'
import { GoogleVenueMap } from '../components/GoogleVenueMap'
import {
  getFeaturedEvent,
  listApprovedPerformers,
  listEventSlots,
  listEventVenues,
  listLiveRanking,
  subscribePerformerMapUpdates,
  type EventSlotRow,
  type EventVenueRow,
  type FeaturedEvent,
} from '../lib/api'
import { distanceKm, formatMapDistance, isFreshLiveLocation, walkingMinutes } from '../lib/mapLocation'
import type { Performer } from '../lib/types'

type Props = {
  onOpenPerformer: (id: string) => void
  onWatchLive: (id: string) => void
  initialView?: View
}

type View = 'map' | 'schedule'

function timeLabel(value: string) {
  return String(value || '').slice(0, 5)
}

export function MapScheduleScreen({ onOpenPerformer, onWatchLive, initialView = 'map' }: Props) {
  const [view, setView] = useState<View>(initialView)
  const [event, setEvent] = useState<FeaturedEvent | null>(null)
  const [venues, setVenues] = useState<EventVenueRow[]>([])
  const [slots, setSlots] = useState<EventSlotRow[]>([])
  const [performers, setPerformers] = useState<Performer[]>([])
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null)
  const [selectedPerformer, setSelectedPerformer] = useState<string | null>(null)
  const [viewerPeaks, setViewerPeaks] = useState<Record<string, number>>({})
  const [selectedDate, setSelectedDate] = useState('2026-10-10')
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locationClock, setLocationClock] = useState(Date.now())

  const refreshLiveMap = useCallback(async () => {
    const [acts, ranks] = await Promise.all([
      listApprovedPerformers(),
      listLiveRanking().catch(() => []),
    ])
    setPerformers(acts)
    setViewerPeaks(Object.fromEntries(ranks.map((row) => [row.performer.id, row.viewer_peak])))
    setLocationClock(Date.now())
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const featured = await getFeaturedEvent()
        const [acts, ranks] = await Promise.all([
          listApprovedPerformers(),
          listLiveRanking().catch(() => []),
        ])
        const [venueRows, slotRows] = featured
          ? await Promise.all([listEventVenues(featured.id), listEventSlots(featured.id)])
          : [[], []]
        if (cancelled) return
        setEvent(featured)
        setPerformers(acts)
        setViewerPeaks(Object.fromEntries(ranks.map((row) => [row.performer.id, row.viewer_peak])))
        setVenues(venueRows)
        setSlots(slotRows)
        setSelectedDate(String(slotRows[0]?.date || '2026-10-10').slice(0, 10))
      } catch {
        if (!cancelled) setError('会場情報を読み込めませんでした。通信を確認して、もう一度開いてください。')
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (view !== 'map') return
    const refresh = () => {
      if (document.visibilityState === 'visible') void refreshLiveMap().catch(() => undefined)
    }
    const timer = window.setInterval(refresh, 20_000)
    const clock = window.setInterval(() => setLocationClock(Date.now()), 15_000)
    let unsubscribe: () => void = () => {}
    try {
      unsubscribe = subscribePerformerMapUpdates((row) => {
        if (!row.is_approved) return
        setPerformers((current) => {
          const exists = current.some((item) => item.id === row.id)
          return exists ? current.map((item) => item.id === row.id ? row : item) : [...current, row]
        })
        setLocationClock(Date.now())
      })
    } catch {
      // Polling remains active when Realtime is unavailable.
    }
    return () => {
      window.clearInterval(timer)
      window.clearInterval(clock)
      unsubscribe()
    }
  }, [refreshLiveMap, view])

  const performerById = useMemo(() => new Map(performers.map((performer) => [performer.id, performer])), [performers])
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues])
  const selectedSlots = useMemo(() => slots.filter((slot) => (!selectedVenue || slot.venue_id === selectedVenue) && String(slot.date).slice(0, 10) === selectedDate), [slots, selectedVenue, selectedDate])
  const dates = useMemo(() => {
    const values = [...new Set(slots.map((slot) => String(slot.date).slice(0, 10)))]
    return values.length ? values : ['2026-10-10', '2026-10-11', '2026-10-12']
  }, [slots])
  const dateSlots = useMemo(() => slots.filter((slot) => String(slot.date).slice(0, 10) === selectedDate), [slots, selectedDate])
  const liveMapPerformers = useMemo(
    () => performers.filter((performer) => isFreshLiveLocation(performer, locationClock)),
    [locationClock, performers],
  )
  const selectedLivePerformer = useMemo(
    () => liveMapPerformers.find((performer) => performer.id === selectedPerformer) ?? null,
    [liveMapPerformers, selectedPerformer],
  )
  const nearbyLive = useMemo(() => liveMapPerformers
    .map((performer) => ({
      performer,
      distance: userLocation && performer.lat != null && performer.lng != null
        ? distanceKm(userLocation, { lat: performer.lat, lng: performer.lng })
        : null,
    }))
    .sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY)),
  [liveMapPerformers, userLocation])

  return (
    <main className="pl-experience pl-map-schedule">
      <header className="pl-page-intro">
        <p>FIND THE STAGE</p>
        <h1>今いる場所から、次の熱狂へ。</h1>
        <span>{event ? `${event.date_label} · ${event.place_label}` : '会場と出演予定'}</span>
      </header>

      <div className="pl-segment" role="tablist" aria-label="MAPとスケジュール">
        <button type="button" role="tab" aria-selected={view === 'map'} data-active={view === 'map'} onClick={() => setView('map')}><MapIcon size={17} /> MAP</button>
        <button type="button" role="tab" aria-selected={view === 'schedule'} data-active={view === 'schedule'} onClick={() => setView('schedule')}><CalendarDays size={17} /> スケジュール</button>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}

      {view === 'map' ? (
        <>
          <section className="pl-map-directory" aria-label="会場と現在の出演">
            <header><div><p>VENUES</p><h2>練馬城址公園 会場MAP</h2></div><span>{venues.length}会場</span></header>
            <div>
              {venues.map((venue) => {
                const venueSlots = dateSlots.filter((slot) => slot.venue_id === venue.id)
                const active = venueSlots.find((slot) => timeLabel(slot.start_time) <= timeLabel(new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })) && timeLabel(slot.end_time) > timeLabel(new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })))
                const upcoming = active ?? venueSlots[0]
                const act = upcoming?.performer_id ? performerById.get(upcoming.performer_id) : null
                return <button type="button" key={venue.id} onClick={() => { setSelectedVenue(venue.id); setSelectedPerformer(null) }}>
                  <MapIcon size={17} /><span><strong>{venue.name_ja}</strong><small>{act ? `${active ? '開催中' : timeLabel(upcoming.start_time)} · ${act.stage_name}` : venue.blurb_ja || (venue.venue_type === 'food' ? 'フード / キッチンカー' : '出演予定を確認')}</small></span><ChevronRight size={17} />
                </button>
              })}
              {venues.length === 0 ? <p>会場情報を準備しています。Google Mapsは引き続き利用できます。</p> : null}
            </div>
          </section>
          <GoogleVenueMap
            venues={venues}
            livePerformers={liveMapPerformers}
            selectedPerformerId={selectedPerformer}
            selectedVenueId={selectedVenue}
            onSelectPerformer={(id) => { setSelectedPerformer(id); setSelectedVenue(null) }}
            onSelectVenue={(id) => { setSelectedVenue(id); setSelectedPerformer(null) }}
            onLocationChange={setUserLocation}
          />

          {selectedLivePerformer ? (() => {
            const performer = selectedLivePerformer
            const point = { lat: performer.lat!, lng: performer.lng! }
            const km = userLocation ? distanceKm(userLocation, point) : null
            const matchingSlot = dateSlots.find((slot) => slot.performer_id === performer.id)
            const venue = matchingSlot ? venueById.get(matchingSlot.venue_id) : null
            const directions = `https://www.google.com/maps/dir/?api=1${userLocation ? `&origin=${userLocation.lat},${userLocation.lng}` : ''}&destination=${point.lat},${point.lng}&travelmode=walking`
            return (
              <section className="pl-venue-sheet pl-live-map-sheet" aria-label={`${performer.stage_name}のLIVE情報`}>
                <div className="pl-venue-sheet__top">
                  <div><p>LIVE NOW{km != null ? ` · 徒歩約${walkingMinutes(km)}分` : ''}</p><h2>{performer.stage_name}</h2><span>{performer.genre || 'Performance'} · {venue?.name_ja || performer.city || '現在地を共有中'}</span></div>
                  {performer.photo_url ? <img src={performer.photo_url} alt="" /> : <span className="pl-live-map-sheet__avatar">{performer.stage_name.slice(0, 2)}</span>}
                </div>
                <div className="pl-live-map-sheet__facts">
                  <span><Radio size={14} /> LIVE中</span>
                  {km != null ? <span><Navigation size={14} /> 現在地から {formatMapDistance(km)}</span> : null}
                  <span><UserRound size={14} /> 視聴 {viewerPeaks[performer.id] ?? 0}</span>
                </div>
                <div className="pl-venue-sheet__actions">
                  <button type="button" className="pl-action pl-action--live" onClick={() => onWatchLive(performer.id)}><Radio size={17} /> LIVEを見る</button>
                  <button type="button" className="pl-action pl-action--glass" onClick={() => onOpenPerformer(performer.id)}><UserRound size={17} /> プロフィール</button>
                  <a className="pl-action pl-action--primary" href={directions} target="_blank" rel="noopener noreferrer"><Navigation size={17} /> ここへ行く</a>
                </div>
              </section>
            )
          })() : selectedVenue ? (() => {
            const venue = venueById.get(selectedVenue)
            if (!venue) return null
            const first = selectedSlots[0]
            const act = first?.performer_id ? performerById.get(first.performer_id) : null
            const venuePosition = venue.lat != null && venue.lng != null ? { lat: venue.lat, lng: venue.lng } : null
            const km = userLocation && venuePosition ? distanceKm(userLocation, venuePosition) : null
            const walkMinutes = km == null ? null : walkingMinutes(km)
            const directions = venuePosition ? `https://www.google.com/maps/dir/?api=1${userLocation ? `&origin=${userLocation.lat},${userLocation.lng}` : ''}&destination=${venuePosition.lat},${venuePosition.lng}&travelmode=walking` : null
            return (
              <section className="pl-venue-sheet">
                <div className="pl-venue-sheet__top">
                  <div><p>STAGE{walkMinutes ? ` · 徒歩約${walkMinutes}分` : ''}</p><h2>{venue.name_ja}</h2><span>{venue.blurb_ja || '次の出演をチェック'}</span></div>
                  {act?.photo_url ? <img src={act.photo_url} alt="" /> : null}
                </div>
                {first && act ? (
                  <button type="button" className="pl-venue-sheet__act" onClick={() => onOpenPerformer(act.id)}>
                    <span><small>{act.is_live ? 'LIVE NOW' : `${timeLabel(first.start_time)}–${timeLabel(first.end_time)}`}</small><strong>{act.stage_name}</strong><em>{act.genre || first.stage_ja} · {venue.name_ja}</em></span>
                    <ChevronRight size={20} />
                  </button>
                ) : null}
                <div className="pl-venue-sheet__actions">
                  {directions ? <a className="pl-action pl-action--primary" href={directions} target="_blank" rel="noopener noreferrer"><Navigation size={17} /> ここへ行く</a> : null}
                  {act ? <button type="button" className="pl-action pl-action--glass" onClick={() => onOpenPerformer(act.id)}><UserRound size={17} /> プロフィール</button> : null}
                  {act?.is_live ? <button type="button" className="pl-action pl-action--live" onClick={() => onWatchLive(act.id)}><Radio size={17} /> LIVEを見る</button> : null}
                </div>
              </section>
            )
          })() : null}

          <section className="pl-near-live" aria-label="近くでLIVE中">
            <header><div><p>NEAR YOU</p><h2>近くでLIVE中</h2></div><span>{nearbyLive.length}組</span></header>
            {nearbyLive.length > 0 ? (
              <div className="pl-near-live__rail">
                {nearbyLive.map(({ performer, distance }) => (
                  <button type="button" key={performer.id} onClick={() => { setSelectedPerformer(performer.id); setSelectedVenue(null) }}>
                    <span className="pl-near-live__portrait">{performer.photo_url ? <img src={performer.photo_url} alt="" /> : performer.stage_name.slice(0, 2)}<i>LIVE</i></span>
                    <span className="pl-near-live__body"><strong>{performer.stage_name}</strong><small>{performer.genre || 'Performance'}</small><em>{distance != null ? `現在地から ${formatMapDistance(distance)}` : '位置共有中'} · 視聴 {viewerPeaks[performer.id] ?? 0}</em></span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            ) : <p className="pl-near-live__empty">現在地を共有しているLIVEはまだありません。</p>}
          </section>
        </>
      ) : (
        <section className="pl-schedule-v7">
          <div className="pl-schedule-v7__dates" role="tablist" aria-label="開催日">
            {dates.map((date) => <button type="button" role="tab" aria-selected={selectedDate === date} data-active={selectedDate === date} key={date} onClick={() => setSelectedDate(date)}><strong>{date.slice(8)}</strong><small>10月</small></button>)}
          </div>
          {dateSlots.length === 0 ? (
            <div className="pl-schedule-preview" role="status">
              <p className="pl-schedule-preview__note">この日の出演スケジュールは近日公開します。</p>
            </div>
          ) : null}
          {dateSlots.map((slot) => {
            const act = slot.performer_id ? performerById.get(slot.performer_id) : null
            const venue = venueById.get(slot.venue_id)
            return (
              <button key={slot.id} type="button" className="pl-schedule-row" disabled={!act} onClick={() => act && (act.is_live ? onWatchLive(act.id) : onOpenPerformer(act.id))}>
                <span className="pl-schedule-row__time"><Clock3 size={15} />{timeLabel(slot.start_time)}</span>
                <span className="pl-schedule-row__media">{act?.photo_url ? <img src={act.photo_url} alt="" /> : <span />}</span>
                <span className="pl-schedule-row__body"><strong>{act?.stage_name || slot.stage_ja}</strong><small>{venue?.name_ja || slot.stage_ja} · {act?.genre || 'Performance'}</small>{act?.is_live ? <em><Radio size={11} /> LIVE</em> : null}</span>
                <ChevronRight size={18} />
              </button>
            )
          })}
        </section>
      )}

      {performers.length > 0 ? (
        <section className="pl-event-lineup" aria-label="出演パフォーマー">
          <header><div><p>PERFORMERS</p><h2>出演パフォーマー</h2></div><span>{performers.length}組</span></header>
          <div className="pl-event-lineup__rail">
            {performers.slice(0, 12).map((performer) => (
              <button type="button" key={performer.id} onClick={() => performer.is_live ? onWatchLive(performer.id) : onOpenPerformer(performer.id)}>
                <span>{performer.photo_url ? <img src={performer.photo_url} alt="" /> : performer.stage_name.slice(0, 2)}</span>
                <strong>{performer.stage_name}</strong>
                <small>{performer.is_live ? 'LIVE中' : performer.genre || 'Performance'}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
