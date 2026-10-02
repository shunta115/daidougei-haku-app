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
import { useLang } from '../../i18n/LangProvider'
import type { Lang } from '../../i18n'
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

function scheduleDateCard(iso: string, lang: Lang, holiday: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return { month: '', day: iso.slice(-2), weekday: '' }
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(`${iso}T12:00:00+09:00`)
  const locale = lang === 'en' ? 'en-US' : lang === 'zh-TW' ? 'zh-TW' : 'ja-JP'
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Asia/Tokyo' }).format(date)
  const monday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Tokyo' }).format(date) === 'Mon'
  const sportsDay = month === 10 && monday && day >= 8 && day <= 14
  const monthLabel = lang === 'en' ? new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'Asia/Tokyo' }).format(date) : `${month}月`
  return { month: monthLabel, day: String(day), weekday: sportsDay ? `${weekday}・${holiday}` : weekday }
}

export function MapScheduleScreen({ onOpenPerformer, onWatchLive, initialView = 'map' }: Props) {
  const { t, lang } = useLang()
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
        if (!cancelled) setError(t('mapLoadError'))
      }
    })()
    return () => { cancelled = true }
  }, [t])

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
  const [venueFocusNonce, setVenueFocusNonce] = useState(0)

  const handleVenueSelect = useCallback((venue: EventVenueRow) => {
    setView('map')
    setSelectedVenue(venue.id)
    setSelectedPerformer(null)
    setVenueFocusNonce((value) => value + 1)
    window.requestAnimationFrame(() => {
      document.getElementById('haku-venue-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

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
        <h1>{t('mapHeadline')}</h1>
        <span>{event ? `${event.date_label} · ${event.place_label}` : t('mapFallback')}</span>
      </header>

      <div className="pl-segment" role="tablist" aria-label={t('mapAndSchedule')}>
        <button type="button" role="tab" aria-selected={view === 'map'} data-active={view === 'map'} onClick={() => setView('map')}><MapIcon size={17} /> {t('mapTab')}</button>
        <button type="button" role="tab" aria-selected={view === 'schedule'} data-active={view === 'schedule'} onClick={() => setView('schedule')}><CalendarDays size={17} /> {t('scheduleTab')}</button>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}

      {view === 'map' ? (
        <>
          <div className="pl-map-stage">
            <GoogleVenueMap
              venues={venues}
              livePerformers={liveMapPerformers}
              selectedPerformerId={selectedPerformer}
              selectedVenueId={selectedVenue}
              onSelectPerformer={(id) => { setSelectedPerformer(id); setSelectedVenue(null) }}
              onSelectVenue={(id) => { setSelectedVenue(id); setSelectedPerformer(null) }}
              onLocationChange={setUserLocation}
              venueFocusNonce={venueFocusNonce}
            />

          {selectedLivePerformer ? (() => {
            const performer = selectedLivePerformer
            const point = { lat: performer.lat!, lng: performer.lng! }
            const km = userLocation ? distanceKm(userLocation, point) : null
            const matchingSlot = dateSlots.find((slot) => slot.performer_id === performer.id)
            const venue = matchingSlot ? venueById.get(matchingSlot.venue_id) : null
            const place = venue?.name_ja || performer.city || ''
            const meta = [performer.genre, place].filter(Boolean).join(' · ')
            const viewers = viewerPeaks[performer.id]
            const directions = `https://www.google.com/maps/dir/?api=1${userLocation ? `&origin=${userLocation.lat},${userLocation.lng}` : ''}&destination=${point.lat},${point.lng}&travelmode=walking`
            return (
              <section className="pl-venue-sheet pl-live-map-sheet pl-map-stage__sheet" aria-label={t('mapLiveSheet', { name: performer.stage_name })}>
                <div className="pl-venue-sheet__top">
                  <div><p>LIVE NOW{km != null ? ` · ${t('mapWalk', { n: walkingMinutes(km) })}` : ''}</p><h2>{performer.stage_name}</h2>{meta ? <span>{meta}</span> : null}</div>
                  {performer.photo_url ? <img src={performer.photo_url} alt="" /> : <span className="pl-live-map-sheet__avatar">{performer.stage_name.slice(0, 2)}</span>}
                </div>
                <div className="pl-live-map-sheet__facts">
                  <span><Radio size={14} /> {t('liveNow')}</span>
                  {km != null ? <span><Navigation size={14} /> {t('mapFromHere', { distance: formatMapDistance(km) })}</span> : null}
                  {viewers != null ? <span><UserRound size={14} /> {t('mapViewers', { n: viewers })}</span> : null}
                </div>
                <div className="pl-venue-sheet__actions">
                  <button type="button" className="pl-action pl-action--live" onClick={() => onWatchLive(performer.id)}><Radio size={17} /> {t('eventWatchLive')}</button>
                  <button type="button" className="pl-action pl-action--glass" onClick={() => onOpenPerformer(performer.id)}><UserRound size={17} /> {t('eventProfile')}</button>
                  <a className="pl-action pl-action--primary" href={directions} target="_blank" rel="noopener noreferrer"><Navigation size={17} /> {t('mapGo')}</a>
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
              <section className="pl-venue-sheet pl-map-stage__sheet">
                <div className="pl-venue-sheet__top">
                  <div><p>STAGE{walkMinutes ? ` · ${t('mapWalk', { n: walkMinutes })}` : ''}</p><h2>{venue.name_ja}</h2><span>{venue.blurb_ja || t('mapNextCheck')}</span></div>
                  {act?.photo_url ? <img src={act.photo_url} alt="" /> : null}
                </div>
                {first && act ? (
                  <button type="button" className="pl-venue-sheet__act" onClick={() => onOpenPerformer(act.id)}>
                    <span><small>{act.is_live ? 'LIVE NOW' : `${timeLabel(first.start_time)}–${timeLabel(first.end_time)}`}</small><strong>{act.stage_name}</strong><em>{act.genre || first.stage_ja} · {venue.name_ja}</em></span>
                    <ChevronRight size={20} />
                  </button>
                ) : null}
                <div className="pl-venue-sheet__actions">
                  {directions ? <a className="pl-action pl-action--primary" href={directions} target="_blank" rel="noopener noreferrer"><Navigation size={17} /> {t('mapGo')}</a> : null}
                  {act ? <button type="button" className="pl-action pl-action--glass" onClick={() => onOpenPerformer(act.id)}><UserRound size={17} /> {t('eventProfile')}</button> : null}
                  {act?.is_live ? <button type="button" className="pl-action pl-action--live" onClick={() => onWatchLive(act.id)}><Radio size={17} /> {t('eventWatchLive')}</button> : null}
                </div>
              </section>
            )
          })() : null}
          </div>

          <section className="pl-map-directory" aria-label={t('mapVenues')}>
            <header><div><p>VENUES</p><h2>{t('mapVenueMap')}</h2></div><span>{t('mapVenueCount', { n: venues.length })}</span></header>
            <div>
              {venues.map((venue) => {
                const venueSlots = dateSlots.filter((slot) => slot.venue_id === venue.id)
                const active = venueSlots.find((slot) => timeLabel(slot.start_time) <= timeLabel(new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })) && timeLabel(slot.end_time) > timeLabel(new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })))
                const upcoming = active ?? venueSlots[0]
                const act = upcoming?.performer_id ? performerById.get(upcoming.performer_id) : null
                return <button type="button" key={venue.id} data-active={selectedVenue === venue.id} onClick={() => handleVenueSelect(venue)}>
                  <MapIcon size={17} /><span><strong>{venue.name_ja}</strong><small>{[venue.blurb_ja, act ? `${active ? t('mapOnNow') : timeLabel(upcoming.start_time)} · ${act.stage_name}` : null].filter(Boolean).join(' · ') || (venue.venue_type === 'food' ? t('mapFood') : t('mapCheckActs'))}</small></span><ChevronRight size={17} />
                </button>
              })}
              {venues.length === 0 ? <p>{t('mapVenuesPreparing')}</p> : null}
            </div>
          </section>

          <section className="pl-near-live" aria-label={t('mapNear')}>
            <header><div><p>NEAR YOU</p><h2>{t('mapNear')}</h2></div><span>{t('mapGroupCount', { n: nearbyLive.length })}</span></header>
            {nearbyLive.length > 0 ? (
              <div className="pl-near-live__rail">
                {nearbyLive.map(({ performer, distance }) => (
                  <button type="button" key={performer.id} onClick={() => { setSelectedPerformer(performer.id); setSelectedVenue(null) }}>
                    <span className="pl-near-live__portrait">{performer.photo_url ? <img src={performer.photo_url} alt="" /> : performer.stage_name.slice(0, 2)}<i>LIVE</i></span>
                    <span className="pl-near-live__body"><strong>{performer.stage_name}</strong><small>{performer.genre || 'Performance'}</small><em>{distance != null ? t('mapFromHere', { distance: formatMapDistance(distance) }) : t('mapSharingShort')} · {t('mapViewers', { n: viewerPeaks[performer.id] ?? 0 })}</em></span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            ) : <p className="pl-near-live__empty">{t('mapNoShared')}</p>}
          </section>
        </>
      ) : (
        <section className="pl-schedule-v7">
          <div className="pl-schedule-v7__dates" role="tablist" aria-label={t('mapDates')}>
            {dates.map((date) => { const card = scheduleDateCard(date, lang, t('holiday')); return <button type="button" role="tab" aria-selected={selectedDate === date} data-active={selectedDate === date} key={date} onClick={() => setSelectedDate(date)}><small>{card.month}</small><strong>{card.day}</strong><em>{card.weekday}</em></button> })}
          </div>
          {dateSlots.length === 0 ? (
            <div className="pl-schedule-preview" role="status">
              <p className="pl-schedule-preview__note">{t('mapSchedulePending')}</p>
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
        <section className="pl-event-lineup" aria-label={t('eventLineup')}>
          <header><div><p>PERFORMERS</p><h2>{t('eventLineup')}</h2></div><span>{t('mapGroupCount', { n: performers.length })}</span></header>
          <div className="pl-event-lineup__rail">
            {performers.slice(0, 12).map((performer) => (
              <button type="button" key={performer.id} onClick={() => performer.is_live ? onWatchLive(performer.id) : onOpenPerformer(performer.id)}>
                <span>{performer.photo_url ? <img src={performer.photo_url} alt="" /> : performer.stage_name.slice(0, 2)}</span>
                <strong>{performer.stage_name}</strong>
                <small>{performer.is_live ? t('liveNow') : performer.genre || 'Performance'}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
