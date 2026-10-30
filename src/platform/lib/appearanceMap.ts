import type { PerformerAppearance } from './types'

export type AppearanceMapState = 'scheduled' | 'performance-window'

export function appearanceMapState(row: PerformerAppearance, now = new Date()): AppearanceMapState | null {
  if (row.status !== 'published' || row.venue_lat == null || row.venue_lng == null
    || !Number.isFinite(row.venue_lat) || !Number.isFinite(row.venue_lng)
    || Math.abs(row.venue_lat) > 90 || Math.abs(row.venue_lng) > 180) return null
  const start = Date.parse(row.starts_at)
  const end = row.ends_at ? Date.parse(row.ends_at) : Number.NaN
  if (!Number.isFinite(start)) return null
  if (start > now.getTime()) return 'scheduled'
  if (!Number.isFinite(end)) return 'scheduled'
  return now.getTime() < end ? 'performance-window' : null
}

export function mapVisibleAppearances(rows: PerformerAppearance[], now = new Date()) {
  return rows.filter((row) => appearanceMapState(row, now) !== null)
}
