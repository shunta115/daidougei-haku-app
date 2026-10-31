import type { PerformerAppearance } from './types'
import { resolveAppearanceLocation } from './appearanceLocation'

export type AppearanceMapState = 'scheduled' | 'performance-window'

export function appearanceMapState(row: PerformerAppearance, now = new Date()): AppearanceMapState | null {
  if (row.status !== 'published' || !resolveAppearanceLocation(row)) return null
  const start = Date.parse(row.starts_at)
  const end = row.ends_at ? Date.parse(row.ends_at) : Number.NaN
  if (!Number.isFinite(start) || !Number.isFinite(now.getTime())) return null
  if (row.ends_at && (!Number.isFinite(end) || end <= start)) return null
  if (start > now.getTime()) return 'scheduled'
  if (!Number.isFinite(end)) return null
  return now.getTime() < end ? 'performance-window' : null
}

export function mapVisibleAppearances(rows: PerformerAppearance[], now = new Date()) {
  return rows.filter((row) => appearanceMapState(row, now) !== null)
}
