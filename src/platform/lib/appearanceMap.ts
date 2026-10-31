import type { PerformerAppearance } from './types'
import { resolveAppearanceLocation } from './appearanceLocation'

export type AppearanceMapState = 'scheduled' | 'performance-window'

export function appearanceTimeState(row: PerformerAppearance, now = new Date()): AppearanceMapState | null {
  if (row.status !== 'published') return null
  const start = Date.parse(row.starts_at)
  const end = row.ends_at ? Date.parse(row.ends_at) : Number.NaN
  if (!Number.isFinite(start) || !Number.isFinite(now.getTime())) return null
  if (row.ends_at && (!Number.isFinite(end) || end <= start)) return null
  if (start > now.getTime()) return 'scheduled'
  if (!Number.isFinite(end)) {
    // No invented duration or claim of an active show. Keep today's plan in its own timezone.
    try {
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: row.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(now)
      return date === row.performance_date ? 'scheduled' : null
    } catch { return null }
  }
  return now.getTime() < end ? 'performance-window' : null
}

export function appearanceMapState(row: PerformerAppearance, now = new Date()): AppearanceMapState | null {
  return resolveAppearanceLocation(row) ? appearanceTimeState(row, now) : null
}

// A coarse UTC envelope for local-calendar today (all IANA timezones fit within 50 hours).
// Exact eligibility is checked after retrieval, using each row's timezone.
export function appearanceFetchFilter(now: Date) {
  const today = now.toISOString().slice(0, 10)
  const earliestToday = new Date(Date.parse(`${today}T00:00:00Z`) - 26 * 60 * 60 * 1000).toISOString()
  return `starts_at.gte.${now.toISOString()},ends_at.gte.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${earliestToday})`
}

export function appearanceIsDiscoverable(row: PerformerAppearance, now: Date) {
  if (row.status !== 'published' && !(row.published_at && ['cancelled', 'postponed'].includes(row.status))) return false
  return appearanceTimeState({ ...row, status: 'published' }, now) !== null
}

export function mapVisibleAppearances(rows: PerformerAppearance[], now = new Date()) {
  return rows.filter((row) => appearanceMapState(row, now) !== null)
}
