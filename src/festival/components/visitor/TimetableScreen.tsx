import { useMemo, useState } from 'react'
import { getDemoNow } from '../../lib/demoClock'
import { demoTodayDateString, nextHighlightSlotId, uniqueScheduleDates } from '../../lib/scheduleEngine'
import { readFavorites, toggleFavorite } from '../../lib/favoritesStorage'
import { TIMETABLE_GENRE_CHIPS, TIMETABLE_VENUE_CHIPS, type TimetableScheduleMode } from '../../lib/timetableConstants'
import { buildTimetableRows } from '../../lib/timetableRows'
import { PUBLIC_EVENT_COPY } from '../../services/festivalRepository'
import { TimetableLiveNextBar } from './TimetableLiveNextBar'
import { TimetableDateChips } from './timetable/TimetableDateChips'
import { TimetableFilterChips } from './timetable/TimetableFilterChips'
import { TimetableScheduleToggle } from './timetable/TimetableScheduleToggle'
import { TimetableSlotList } from './timetable/TimetableSlotList'

export type TimetableScreenProps = {
  favTick: number
  onOpenDetail: (performerId: string) => void
  onFavChange: () => void
}

export function TimetableScreen({ favTick, onOpenDetail, onFavChange }: TimetableScreenProps) {
  const dates = useMemo(() => uniqueScheduleDates(), [])
  const [date, setDate] = useState(() => dates[0] ?? demoTodayDateString())
  const [venueId, setVenueId] = useState('all')
  const [genreId, setGenreId] = useState('all')
  const [scheduleMode, setScheduleMode] = useState<TimetableScheduleMode>('normal')
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  const nextId = useMemo(() => nextHighlightSlotId(), [])
  const now = useMemo(() => getDemoNow(), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- favTick intentionally invalidates read from localStorage
  const favIds = useMemo(() => readFavorites(), [favTick])

  const rows = useMemo(
    () =>
      buildTimetableRows(date, now, {
        venueId,
        genreId,
        favoritesOnly,
        favIds,
        scheduleMode,
      }),
    [date, now, venueId, genreId, favoritesOnly, favIds, scheduleMode],
  )

  const handleToggleFavorite = (performerId: string) => {
    toggleFavorite(performerId)
    onFavChange()
  }

  const rainMode = scheduleMode === 'rain'
  const hasSchedule = dates.length > 0

  return (
    <main className={`fe-main fe-main--sub fe-ttv${rainMode ? ' fe-ttv--rain' : ''}`}>
      <header className="fe-page-head fe-page-head--tight">
        <p className="fe-page-head__eyebrow">Schedule</p>
        <h1 className="fe-page-head__title">タイムテーブル</h1>
        <p className="fe-page-head__lead">
          {hasSchedule
            ? '誰が・何時に・どこで — 開始時間順。LIVE / NEXT を強調表示。'
            : PUBLIC_EVENT_COPY.schedulePending}
        </p>
      </header>

      {!hasSchedule ? (
        <p className="fe-public-prep" role="status">
          {PUBLIC_EVENT_COPY.datesPending}
        </p>
      ) : (
        <>
          <TimetableLiveNextBar />

          <TimetableScheduleToggle mode={scheduleMode} onChange={setScheduleMode} />

          <TimetableDateChips dates={dates} value={date} onChange={setDate} />

          <TimetableFilterChips
            label="会場"
            chips={TIMETABLE_VENUE_CHIPS}
            value={venueId}
            onChange={setVenueId}
          />

          <TimetableFilterChips
            label="ジャンル"
            chips={TIMETABLE_GENRE_CHIPS}
            value={genreId}
            onChange={setGenreId}
            className="fe-ttv-filters--genre"
          />

          <label className="fe-ttv-favonly">
            <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
            <span>お気に入りのみ</span>
          </label>

          <TimetableSlotList
            rows={rows}
            nextSlotId={nextId}
            favIds={favIds}
            rainMode={rainMode}
            onOpenDetail={onOpenDetail}
            onToggleFavorite={handleToggleFavorite}
          />

          <section className="fe-tt-foot" aria-label="補足">
            <p className="fe-tt-foot__text">カードの「詳細」または演者名タップでプロフィールへ。★でお気に入り登録。</p>
            <p className="fe-tt-foot__hint">
              基準時刻{' '}
              {now.toLocaleString('ja-JP', {
                timeZone: 'Asia/Tokyo',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {rainMode ? ' · 雨天モード ON' : ''}
            </p>
          </section>
        </>
      )}
    </main>
  )
}
