import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getCatalogVenues, getLiveCatalogVersion, subscribeLiveCatalog } from '../../../catalog/liveCatalog'
import { getPerformerById } from '../../lib/performerCatalog'
import {
  liveSlotIdsForVenue,
  nextSlotIdsForVenue,
  slotsByVenue,
  statusLabelJa,
} from '../../lib/scheduleEngine'
import { isSupabaseConfigured } from '../../../platform/lib/supabase'
import { listLivePerformers } from '../../../platform/lib/api'
import type { Performer as PlatformPerformer } from '../../../platform/lib/types'
import { openLiveWatch } from '../../../app/routes'
import { useLang } from '../../../i18n/LangProvider'

export type MapScreenProps = {
  focusVenueId?: string | null
  onConsumedFocus?: () => void
}

const MAP_LAYOUT: Record<string, { row: number; col: number }> = {
  'nerima-joshi-park': { row: 1, col: 1 },
  'main-lawn': { row: 1, col: 1 },
  'street-a': { row: 1, col: 2 },
  'queens-plaza': { row: 2, col: 1 },
  'canal-walk': { row: 2, col: 2 },
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function MapScreen({ focusVenueId, onConsumedFocus }: MapScreenProps) {
  useSyncExternalStore(subscribeLiveCatalog, getLiveCatalogVersion, () => 0)
  const { t, lang } = useLang()
  const venues = getCatalogVenues()
  const consumedFocusRef = useRef<string | null>(null)
  const [userVenueId, setUserVenueId] = useState<string | null>(null)
  const [stickyOpenId, setStickyOpenId] = useState<string | null>(null)
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [nearbyLive, setNearbyLive] = useState<PlatformPerformer[]>([])

  const validFocus = focusVenueId && venues.some((v) => v.id === focusVenueId) ? focusVenueId : null

  useEffect(() => {
    if (validFocus) setStickyOpenId(validFocus)
  }, [validFocus])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setHere(null),
      { enableHighAccuracy: false, timeout: 4000 },
    )
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void listLivePerformers()
      .then(setNearbyLive)
      .catch(() => setNearbyLive([]))
  }, [])

  const openVenueId = validFocus ?? userVenueId ?? stickyOpenId

  const liveByVenue = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const v of venues) map.set(v.id, liveSlotIdsForVenue(v.id))
    return map
  }, [venues])

  const nextByVenue = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const v of venues) map.set(v.id, nextSlotIdsForVenue(v.id))
    return map
  }, [venues])

  useEffect(() => {
    if (!validFocus) {
      consumedFocusRef.current = null
      return
    }
    if (consumedFocusRef.current === validFocus) return
    consumedFocusRef.current = validFocus
    onConsumedFocus?.()
  }, [validFocus, onConsumedFocus])

  const openVenue = openVenueId ? venues.find((v) => v.id === openVenueId) : null
  const openSlots = openVenueId ? slotsByVenue(openVenueId) : []
  const osm =
    openVenue?.lat != null && openVenue.lng != null
      ? `https://www.openstreetmap.org/?mlat=${openVenue.lat}&mlon=${openVenue.lng}#map=17/${openVenue.lat}/${openVenue.lng}`
      : null

  const closeSheet = () => {
    setUserVenueId(null)
    setStickyOpenId(null)
  }

  return (
    <main className="fe-main fe-main--sub fe-main--mapapp">
      <header className="fe-page-head fe-page-head--tight">
        <p className="fe-page-head__eyebrow" lang="en">
          NOW
        </p>
        <h1 className="fe-page-head__title">{t('mapTitle')}</h1>
        <p className="fe-page-head__lead">{t('mapLead')}</p>
      </header>

      {nearbyLive.length > 0 ? (
        <section className="fe-map-now" aria-label="LIVE">
          <p className="fe-map-now__k" lang="en">
            LIVE
          </p>
          {nearbyLive.slice(0, 6).map((p) => (
            <button
              key={p.id}
              type="button"
              className="fe-map-now__row"
              onClick={() => openLiveWatch(p.id)}
            >
              <span
                className={`fe-map-now__photo${p.photo_url ? ' fe-map-now__photo--img' : ''}`}
                style={p.photo_url ? { backgroundImage: `url(${p.photo_url})` } : undefined}
              />
              <span className="fe-map-now__body">
                <span className="fe-map-now__live">LIVE</span>
                <span className="fe-map-now__name">{p.stage_name}</span>
                <span className="fe-map-now__meta">{p.live_title || p.genre || p.city}</span>
              </span>
            </button>
          ))}
        </section>
      ) : null}

      {venues.length === 0 ? (
        <p className="fe-public-prep" role="status">
          {t('comingSoonVenue')}
        </p>
      ) : (
        <div className="fe-mapgrid" aria-label="会場エリアマップ">
          {venues.map((v, i) => {
            const pos = MAP_LAYOUT[v.id] ?? { row: Math.floor(i / 2) + 1, col: (i % 2) + 1 }
            const liveHere = (liveByVenue.get(v.id)?.size ?? 0) > 0
            const nextHere = (nextByVenue.get(v.id)?.size ?? 0) > 0
            return (
              <button
                key={v.id}
                type="button"
                className={`fe-mapgrid__cell${liveHere ? ' fe-mapgrid__cell--live' : ''}${nextHere ? ' fe-mapgrid__cell--next' : ''}`}
                style={{ gridRow: pos.row, gridColumn: pos.col, background: v.gradient }}
                onClick={() => setUserVenueId(v.id)}
              >
                <span className="fe-mapgrid__name">{lang === 'en' ? v.nameEn : v.nameJa}</span>
                <div className="fe-mapgrid__chips">
                  {liveHere ? <span className="fe-mapgrid__chip fe-mapgrid__chip--live">LIVE</span> : null}
                  {nextHere ? <span className="fe-mapgrid__chip fe-mapgrid__chip--next">NEXT</span> : null}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {openVenue ? (
        <div className="fe-map-sheet" role="dialog" aria-modal="true" aria-labelledby="fe-map-sheet-title">
          <div className="fe-map-sheet__panel fe-map-sheet__panel--tall">
            <header className="fe-map-sheet__head">
              <h2 id="fe-map-sheet-title">{lang === 'en' ? openVenue.nameEn : openVenue.nameJa}</h2>
              <button type="button" className="fe-map-sheet__close" onClick={closeSheet} aria-label="閉じる">
                ×
              </button>
            </header>
            <p className="fe-map-sheet__lead">
              {lang === 'en' ? openVenue.blurbEn : openVenue.blurbJa}
              {here && openVenue.lat != null && openVenue.lng != null
                ? ` · ${haversineKm(here.lat, here.lng, openVenue.lat, openVenue.lng).toFixed(1)}km`
                : ''}
            </p>
            {osm ? (
              <p>
                <a href={osm} target="_blank" rel="noopener noreferrer">
                  {t('osmOpen')}
                </a>
              </p>
            ) : null}
            <ul className="fe-map-sheet__list">
              {openSlots.length === 0 ? <li className="fe-map-sheet__empty">{t('comingSoonSchedule')}</li> : null}
              {openSlots.map((s) => {
                const p = getPerformerById(s.performerId)
                return (
                  <li key={s.id} className="fe-map-sheet__row">
                    <span className="fe-map-sheet__time">
                      {s.date} {s.start}
                    </span>
                    <div>
                      <p className="fe-map-sheet__act">
                  {lang === 'en' ? (p?.name ?? s.performerId) : (p?.nameJa ?? s.performerId)}
                  {s.isStream ? <span className="fe-map-sheet__pill fe-map-sheet__pill--live">LIVE</span> : null}
                        {s.status === 'live' ? <span className="fe-map-sheet__pill fe-map-sheet__pill--live">LIVE</span> : null}
                        {s.status === 'next' ? <span className="fe-map-sheet__pill fe-map-sheet__pill--next">NEXT</span> : null}
                      </p>
                      <p className="fe-map-sheet__sub">{lang === 'en' ? p?.act : p?.actJa}</p>
                      <p className="fe-map-sheet__status">
                        <span className={`fe-map-sheet__st fe-map-sheet__st--${s.status}`}>{statusLabelJa(s.status)}</span>
                        {s.noteJa ? <span className="fe-map-sheet__note">{s.noteJa}</span> : null}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
          <button type="button" className="fe-map-sheet__scrim" aria-label={t('back')} onClick={closeSheet} />
        </div>
      ) : null}
    </main>
  )
}
