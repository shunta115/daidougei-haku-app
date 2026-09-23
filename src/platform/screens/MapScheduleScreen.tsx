import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Clock3, Map as MapIcon, Navigation, Radio, UserRound } from 'lucide-react'
import { GoogleVenueMap } from '../components/GoogleVenueMap'
import {
  getFeaturedEvent,
  listApprovedPerformers,
  listEventSlots,
  listEventVenues,
  type EventSlotRow,
  type EventVenueRow,
  type FeaturedEvent,
} from '../lib/api'
import type { Performer } from '../lib/types'

type Props = {
  onOpenPerformer: (id: string) => void
  onWatchLive: (id: string) => void
  initialView?: View
}

type View = 'map' | 'schedule'

const PREVIEW_TIMES = [
  { time: '10:00', label: 'モーニングステージ' },
  { time: '11:30', label: 'ストリートステージ' },
  { time: '14:30', label: 'アフタヌーンステージ' },
  { time: '16:00', label: 'スペシャルステージ' },
]

function timeLabel(value: string) {
  return String(value || '').slice(0, 5)
}

function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const rad = (value: number) => value * Math.PI / 180
  const dLat = rad(to.lat - from.lat)
  const dLng = rad(to.lng - from.lng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function MapScheduleScreen({ onOpenPerformer, onWatchLive, initialView = 'map' }: Props) {
  const [view, setView] = useState<View>(initialView)
  const [event, setEvent] = useState<FeaturedEvent | null>(null)
  const [venues, setVenues] = useState<EventVenueRow[]>([])
  const [slots, setSlots] = useState<EventSlotRow[]>([])
  const [performers, setPerformers] = useState<Performer[]>([])
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState('2026-10-10')
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const featured = await getFeaturedEvent()
        const acts = await listApprovedPerformers()
        const [venueRows, slotRows] = featured
          ? await Promise.all([listEventVenues(featured.id), listEventSlots(featured.id)])
          : [[], []]
        if (cancelled) return
        setEvent(featured)
        setPerformers(acts)
        setVenues(venueRows)
        setSlots(slotRows)
        setSelectedVenue(venueRows[0]?.id ?? null)
        setSelectedDate(String(slotRows[0]?.date || '2026-10-10').slice(0, 10))
      } catch {
        if (!cancelled) setError('会場情報を読み込めませんでした。通信を確認して、もう一度開いてください。')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const performerById = useMemo(() => new Map(performers.map((performer) => [performer.id, performer])), [performers])
  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues])
  const selectedSlots = useMemo(() => slots.filter((slot) => (!selectedVenue || slot.venue_id === selectedVenue) && String(slot.date).slice(0, 10) === selectedDate), [slots, selectedVenue, selectedDate])
  const dates = useMemo(() => {
    const values = [...new Set(slots.map((slot) => String(slot.date).slice(0, 10)))]
    return values.length ? values : ['2026-10-10', '2026-10-11', '2026-10-12']
  }, [slots])
  const dateSlots = useMemo(() => slots.filter((slot) => String(slot.date).slice(0, 10) === selectedDate), [slots, selectedDate])

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
          <GoogleVenueMap
            venues={venues}
            slots={slots}
            performers={performers}
            selectedDate={selectedDate}
            selectedVenueId={selectedVenue}
            onSelectVenue={setSelectedVenue}
            onLocationChange={setUserLocation}
          />

          {selectedVenue ? (() => {
            const venue = venueById.get(selectedVenue)
            if (!venue) return null
            const first = selectedSlots[0]
            const act = first?.performer_id ? performerById.get(first.performer_id) : null
            const venuePosition = venue.lat != null && venue.lng != null ? { lat: venue.lat, lng: venue.lng } : null
            const km = userLocation && venuePosition ? distanceKm(userLocation, venuePosition) : null
            const walkMinutes = km == null ? null : Math.max(1, Math.round(km * 1000 / 80))
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
        </>
      ) : (
        <section className="pl-schedule-v7">
          <div className="pl-schedule-v7__dates" role="tablist" aria-label="開催日">
            {dates.map((date) => <button type="button" role="tab" aria-selected={selectedDate === date} data-active={selectedDate === date} key={date} onClick={() => setSelectedDate(date)}><strong>{date.slice(8)}</strong><small>10月</small></button>)}
          </div>
          {dateSlots.length === 0 ? (
            <div className="pl-schedule-preview" aria-label="出演時間枠プレビュー">
              <p className="pl-schedule-preview__note">出演者公開前 · 時間枠プレビュー</p>
              {PREVIEW_TIMES.map((item) => (
                <div key={item.time} className="pl-schedule-row pl-schedule-row--preview" aria-disabled="true">
                  <span className="pl-schedule-row__time"><Clock3 size={15} />{item.time}</span>
                  <span className="pl-schedule-row__media"><span>HAKU</span></span>
                  <span className="pl-schedule-row__body"><strong>出演者は後日発表</strong><small>{item.label} · 会場調整中</small></span>
                  <ChevronRight size={18} />
                </div>
              ))}
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
