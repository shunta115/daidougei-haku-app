import { useEffect, useMemo, useRef, useState } from 'react'
import { HOT_RANK_IDS, performerById } from '../../data'
import { VENUE_AREAS } from '../../data/scheduleData'
import {
  liveSlotIdsForVenue,
  nextSlotIdsForVenue,
  slotsByVenue,
  statusLabelJa,
  demoTodayDateString,
} from '../../lib/scheduleEngine'

export type MapScreenProps = {
  focusVenueId?: string | null
  onConsumedFocus?: () => void
}

/** エリアグリッド上の配置（地図風） */
const MAP_LAYOUT: Record<string, { row: number; col: number }> = {
  'main-lawn': { row: 1, col: 1 },
  'street-a': { row: 1, col: 2 },
  'queens-plaza': { row: 2, col: 1 },
  'canal-walk': { row: 2, col: 2 },
}

export function MapScreen({ focusVenueId, onConsumedFocus }: MapScreenProps) {
  const consumedFocusRef = useRef<string | null>(null)
  const [userVenueId, setUserVenueId] = useState<string | null>(null)
  const [stickyOpenId, setStickyOpenId] = useState<string | null>(null)
  const [syncedFocusKey, setSyncedFocusKey] = useState<string | null>(null)
  const today = demoTodayDateString()

  const validFocus =
    focusVenueId && VENUE_AREAS.some((v) => v.id === focusVenueId) ? focusVenueId : null

  if (validFocus !== syncedFocusKey) {
    setSyncedFocusKey(validFocus)
    if (validFocus) {
      setStickyOpenId(validFocus)
    }
  }

  const openVenueId = validFocus ?? userVenueId ?? stickyOpenId

  const liveByVenue = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const v of VENUE_AREAS) {
      map.set(v.id, liveSlotIdsForVenue(v.id))
    }
    return map
  }, [])

  const nextByVenue = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const v of VENUE_AREAS) {
      map.set(v.id, nextSlotIdsForVenue(v.id))
    }
    return map
  }, [])

  const hotPerformerByVenue = useMemo(() => {
    const map = new Map<string, boolean>()
    const hotId = HOT_RANK_IDS[0]
    for (const v of VENUE_AREAS) {
      const slots = slotsByVenue(v.id).filter((s) => s.date === today)
      map.set(v.id, slots.some((s) => s.performerId === hotId))
    }
    return map
  }, [today])

  useEffect(() => {
    if (!validFocus) {
      consumedFocusRef.current = null
      return
    }
    if (consumedFocusRef.current === validFocus) return
    consumedFocusRef.current = validFocus
    onConsumedFocus?.()
  }, [validFocus, onConsumedFocus])

  const openVenue = openVenueId ? VENUE_AREAS.find((v) => v.id === openVenueId) : null
  const openSlots = openVenueId ? slotsByVenue(openVenueId) : []

  const closeSheet = () => {
    setUserVenueId(null)
    setStickyOpenId(null)
    setSyncedFocusKey(null)
  }

  return (
    <main className="fe-main fe-main--sub fe-main--mapapp">
      <header className="fe-page-head fe-page-head--tight">
        <p className="fe-page-head__eyebrow">Venue</p>
        <h1 className="fe-page-head__title">会場マップ</h1>
        <p className="fe-page-head__lead">タップで演目一覧 · LIVE / NEXT / CROWD / HOT</p>
      </header>

      <div className="fe-mapgrid" aria-label="会場エリアマップ">
        {VENUE_AREAS.map((v) => {
          const pos = MAP_LAYOUT[v.id] ?? { row: 1, col: 1 }
          const liveHere = (liveByVenue.get(v.id)?.size ?? 0) > 0
          const nextHere = (nextByVenue.get(v.id)?.size ?? 0) > 0
          const isHot = hotPerformerByVenue.get(v.id)
          return (
            <button
              key={v.id}
              type="button"
              className="fe-mapgrid__cell"
              style={{
                gridRow: pos.row,
                gridColumn: pos.col,
                background: v.gradient,
              }}
              onClick={() => setUserVenueId(v.id)}
            >
              <span className="fe-mapgrid__name">{v.nameJa}</span>
              <div className="fe-mapgrid__chips">
                {liveHere ? <span className="fe-mapgrid__chip fe-mapgrid__chip--live">LIVE</span> : null}
                {nextHere ? <span className="fe-mapgrid__chip fe-mapgrid__chip--next">NEXT</span> : null}
                {v.crowd ? (
                  <span className={`fe-mapgrid__chip fe-mapgrid__chip--crowd fe-mapgrid__chip--crowd-${v.crowd}`}>CROWD</span>
                ) : null}
                {isHot ? <span className="fe-mapgrid__chip fe-mapgrid__chip--hot">HOT</span> : null}
              </div>
            </button>
          )
        })}
      </div>

      {openVenue ? (
        <div className="fe-map-sheet" role="dialog" aria-modal="true" aria-labelledby="fe-map-sheet-title">
          <div className="fe-map-sheet__panel fe-map-sheet__panel--tall">
            <header className="fe-map-sheet__head">
              <h2 id="fe-map-sheet-title">{openVenue.nameJa}</h2>
              <button type="button" className="fe-map-sheet__close" onClick={closeSheet} aria-label="閉じる">
                ×
              </button>
            </header>
            <p className="fe-map-sheet__lead">{openVenue.blurbJa}</p>
            <ul className="fe-map-sheet__list">
              {openSlots.length === 0 ? <li className="fe-map-sheet__empty">このエリアに演目はありません（デモ）</li> : null}
              {openSlots.map((s) => {
                const p = performerById(s.performerId)
                return (
                  <li key={s.id} className="fe-map-sheet__row">
                    <span className="fe-map-sheet__time">
                      {s.date} {s.start}
                    </span>
                    <div>
                      <p className="fe-map-sheet__act">
                        {p?.nameJa ?? s.performerId}
                        {s.status === 'live' ? <span className="fe-map-sheet__pill fe-map-sheet__pill--live">LIVE</span> : null}
                        {s.status === 'next' ? <span className="fe-map-sheet__pill fe-map-sheet__pill--next">NEXT</span> : null}
                      </p>
                      <p className="fe-map-sheet__sub">{p?.actJa}</p>
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
          <button type="button" className="fe-map-sheet__scrim" aria-label="閉じる" onClick={closeSheet} />
        </div>
      ) : null}
    </main>
  )
}
