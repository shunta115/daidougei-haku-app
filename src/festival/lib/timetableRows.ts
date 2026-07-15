import type { Performer, ScheduleSlot } from '../types'
import { performerById } from '../data'
import { derivedAudienceTimeStatus, slotsByDate, sortSlotsChronological } from './scheduleEngine'
import type { TimetableScheduleMode } from './timetableConstants'

export function performerMatchesGenreFilter(performer: Performer | undefined, genreId: string): boolean {
  if (genreId === 'all') return true
  if (!performer?.genre) return false
  const g = performer.genre
  switch (genreId) {
    case 'パントマイム':
      return g.includes('マイム') || g.includes('パント')
    case 'マジック':
      return g.includes('マジック') || g.toLowerCase().includes('magic')
    case 'ファイア / ダンス':
      return g.includes('ファイア') || g.includes('ダンス')
    case 'マイム / サイレント':
      return g.includes('マイム') || g.includes('サイレント')
    default:
      return g === genreId || g.includes(genreId)
  }
}

export function filterTimetableSlots(
  slots: ScheduleSlot[],
  opts: {
    venueId: string
    genreId: string
    favoritesOnly: boolean
    favIds: string[]
    scheduleMode: TimetableScheduleMode
  },
): ScheduleSlot[] {
  let rows = slots
  if (opts.venueId !== 'all') {
    rows = rows.filter((s) => s.venueId === opts.venueId)
  }
  if (opts.genreId !== 'all') {
    rows = rows.filter((s) => performerMatchesGenreFilter(performerById(s.performerId), opts.genreId))
  }
  if (opts.favoritesOnly) {
    rows = rows.filter((s) => opts.favIds.includes(s.performerId))
  }
  if (opts.scheduleMode === 'rain') {
    rows = rows.filter(
      (s) =>
        s.status === 'indoor_moved' ||
        s.status === 'delayed' ||
        s.status === 'cancelled' ||
        Boolean(s.noteJa?.includes('雨')),
    )
  }
  return sortSlotsChronological(rows)
}

export function buildTimetableRows(
  date: string,
  now: Date,
  opts: Parameters<typeof filterTimetableSlots>[1],
) {
  const rows = filterTimetableSlots(slotsByDate(date), opts)
  return rows.map((slot) => {
    const performer = performerById(slot.performerId)
    const aud = derivedAudienceTimeStatus(slot, now)
    return { slot, performer, aud }
  })
}
