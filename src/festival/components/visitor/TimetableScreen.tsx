import { useMemo, useState } from 'react'
import { getDemoNow } from '../../lib/demoClock'
import { PERFORMERS, performerById } from '../../data'
import {
  nextHighlightSlotId,
  slotsByDate,
  slotsByPerformer,
  slotsByVenue,
  slotsSorted,
  statusLabelJa,
  uniqueScheduleDates,
  derivedAudienceTimeStatus,
  sortSlotsForLiveView,
  audienceStatusLabelJa,
  audienceStatusLabelEn,
  uniqueGenresFromPerformers,
} from '../../lib/scheduleEngine'
import { VENUE_AREAS } from '../../data/scheduleData'
import { TimetableLiveNextBar } from './TimetableLiveNextBar'
import { readFavorites } from '../../lib/favoritesStorage'

type Tab = 'date' | 'venue' | 'performer'

export type TimetableScreenProps = {
  favTick: number
}

export function TimetableScreen({ favTick }: TimetableScreenProps) {
  const [tab, setTab] = useState<Tab>('date')
  const [date, setDate] = useState(() => uniqueScheduleDates()[1] ?? uniqueScheduleDates()[0])
  const [venueId, setVenueId] = useState(VENUE_AREAS[0]?.id ?? '')
  const [performerId, setPerformerId] = useState(PERFORMERS[0]?.id ?? '')
  const [genre, setGenre] = useState<string>('all')
  const [venueFilter, setVenueFilter] = useState<string>('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  const nextId = useMemo(() => nextHighlightSlotId(), [])
  const now = useMemo(() => getDemoNow(), [])
  const genres = useMemo(() => uniqueGenresFromPerformers(PERFORMERS), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- favTick intentionally invalidates read from localStorage
  const favIds = useMemo(() => readFavorites(), [favTick])

  const baseRows = useMemo(() => {
    let rows =
      tab === 'date' ? slotsByDate(date) : tab === 'venue' ? slotsByVenue(venueId) : slotsByPerformer(performerId)
    if (venueFilter !== 'all') {
      rows = rows.filter((s) => s.venueId === venueFilter)
    }
    if (genre !== 'all') {
      rows = rows.filter((s) => {
        const p = performerById(s.performerId)
        return p?.genre === genre
      })
    }
    if (favoritesOnly) {
      rows = rows.filter((s) => favIds.includes(s.performerId))
    }
    return sortSlotsForLiveView(rows, now)
  }, [tab, date, venueId, performerId, venueFilter, genre, favoritesOnly, favIds, now])

  return (
    <main className="fe-main fe-main--sub">
      <header className="fe-page-head fe-page-head--tight">
        <p className="fe-page-head__eyebrow">Schedule</p>
        <h1 className="fe-page-head__title">タイムテーブル</h1>
        <p className="fe-page-head__lead">LIVE / まもなく / 終了を自動判定。お気に入り・ジャンル・会場で絞り込み。</p>
      </header>

      <TimetableLiveNextBar />

      <div className="fe-tt-tabs" role="tablist" aria-label="表示切替">
        {(
          [
            ['date', '日付'],
            ['venue', '会場'],
            ['performer', '出演'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`fe-tt-tab${tab === id ? ' fe-tt-tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'date' ? (
        <div className="fe-tt-filters">
          {uniqueScheduleDates().map((d) => (
            <button key={d} type="button" className={`fe-tt-chip${d === date ? ' fe-tt-chip--on' : ''}`} onClick={() => setDate(d)}>
              {d}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'venue' ? (
        <div className="fe-tt-filters fe-tt-filters--wrap">
          {VENUE_AREAS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`fe-tt-chip${v.id === venueId ? ' fe-tt-chip--on' : ''}`}
              onClick={() => setVenueId(v.id)}
            >
              {v.nameJa}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'performer' ? (
        <div className="fe-tt-filters fe-tt-filters--wrap">
          {PERFORMERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`fe-tt-chip${p.id === performerId ? ' fe-tt-chip--on' : ''}`}
              onClick={() => setPerformerId(p.id)}
            >
              {p.nameJa}
            </button>
          ))}
        </div>
      ) : null}

      <div className="fe-tt-toolbar">
        <label className="fe-tt-toolbar__item">
          <span className="fe-tt-toolbar__lab">会場</span>
          <select className="fe-tt-select" value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}>
            <option value="all">すべて</option>
            {VENUE_AREAS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nameJa}
              </option>
            ))}
          </select>
        </label>
        <label className="fe-tt-toolbar__item">
          <span className="fe-tt-toolbar__lab">ジャンル</span>
          <select className="fe-tt-select" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="all">すべて</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="fe-tt-toolbar__fav">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
          <span>お気に入りのみ</span>
        </label>
      </div>

      <div className="fe-tt">
        <div className="fe-tt__day">
          <span className="fe-tt__pill">
            {tab === 'date' && `DAY · ${date}`}
            {tab === 'venue' && VENUE_AREAS.find((v) => v.id === venueId)?.nameJa}
            {tab === 'performer' && performerById(performerId)?.nameJa}
          </span>
          <span className="fe-tt__venue">{baseRows.length} slots</span>
        </div>
        <ul className="fe-tt__list">
          {baseRows.length === 0 ? (
            <li className="fe-tt__row fe-tt__row--empty">
              <span className="fe-tt__time">—</span>
              <div>
                <p className="fe-tt__act">該当なし</p>
                <p className="fe-tt__sub">フィルタを変えてみてください</p>
              </div>
            </li>
          ) : null}
          {baseRows.map((slot) => {
            const p = performerById(slot.performerId)
            const isNext = slot.id === nextId
            const dim = slot.status === 'cancelled'
            const aud = derivedAudienceTimeStatus(slot, now)
            return (
              <li
                key={slot.id}
                className={`fe-tt__row${dim ? ' fe-tt__row--dim' : ''}${isNext ? ' fe-tt__row--next' : ''}${aud === 'live_now' ? ' fe-tt__row--live' : ''}`}
              >
                <span className="fe-tt__time">
                  {slot.start}
                  {tab !== 'date' ? <span className="fe-tt__time-sub">{slot.date}</span> : null}
                </span>
                <div>
                  <p className="fe-tt__act">
                    {p?.name ?? slot.performerId}
                    {isNext ? <span className="fe-tt__badge fe-tt__badge--next">NEXT</span> : null}
                    {slot.status === 'live' || aud === 'live_now' ? (
                      <span className="fe-tt__badge fe-tt__badge--live">LIVE</span>
                    ) : null}
                  </p>
                  <p className="fe-tt__sub">
                    {p?.actJa} · {slot.stageJa}
                  </p>
                  <p className="fe-tt__aud">
                    <span className={`fe-tt-aud fe-tt-aud--${aud}`} title={audienceStatusLabelEn(aud)}>
                      {audienceStatusLabelJa(aud)}
                    </span>
                    <span className={`fe-tt-status fe-tt-status--${slot.status}`}>{statusLabelJa(slot.status)}</span>
                    {slot.noteJa ? <span className="fe-tt__note">{slot.noteJa}</span> : null}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <section className="fe-tt-foot" aria-label="投げ銭">
        <p className="fe-tt-foot__text">終了した演目も、応援タブからアーティストへ投げ銭できます。</p>
        <p className="fe-tt-foot__hint">
          全日程 {slotsSorted().length} 枠 · 基準{' '}
          {now.toLocaleString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </section>
    </main>
  )
}
