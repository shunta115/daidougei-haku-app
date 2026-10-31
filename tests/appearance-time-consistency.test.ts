import { expect, it } from 'vitest'
import { appearanceTimeState, appearanceFetchFilter, appearanceIsDiscoverable } from '../src/platform/lib/appearanceMap'
import type { PerformerAppearance } from '../src/platform/lib/types'
const row = { status: 'published', starts_at: '2026-10-31T03:00:00Z', ends_at: null,
  performance_date: '2026-10-31', timezone: 'Asia/Tokyo' } as PerformerAppearance
it('keeps an unbounded plan until local midnight without claiming performance-window', () => {
  expect(appearanceTimeState(row, new Date('2026-10-31T06:57:00Z'))).toBe('scheduled')
  expect(appearanceTimeState(row, new Date('2026-10-31T14:59:59Z'))).toBe('scheduled')
  expect(appearanceTimeState(row, new Date('2026-10-31T15:00:00Z'))).toBeNull()
  expect(appearanceTimeState({ ...row, timezone: 'invalid' }, new Date('2026-10-31T06:57:00Z'))).toBeNull()
})
it('respects UTC+14 and UTC-12 calendar boundaries', () => {
  for (const [timezone, starts_at, now] of [
    ['Pacific/Kiritimati', '2026-10-30T10:00:00Z', '2026-10-31T09:59:59Z'],
    ['Etc/GMT+12', '2026-10-31T12:00:00Z', '2026-11-01T11:59:59Z'],
  ]) {
    const value = { ...row, timezone, starts_at }
    expect(appearanceIsDiscoverable(value, new Date(now))).toBe(true)
    expect(appearanceTimeState(value, new Date(Date.parse(now) + 1000))).toBeNull()
    const lower = appearanceFetchFilter(new Date(now)).match(/and\(ends_at.is.null,starts_at.gte.([^)]*)\)/)![1]
    expect(Date.parse(starts_at)).toBeGreaterThanOrEqual(Date.parse(lower))
  }
})
it('does not extend known endings or expose nonpublic plans', () => {
  const now = new Date('2026-10-31T06:57:00Z')
  expect(appearanceTimeState({ ...row, ends_at: '2026-10-31T11:00:00Z' }, now)).toBe('performance-window')
  expect(appearanceTimeState({ ...row, ends_at: '2026-10-31T06:57:00Z' }, now)).toBeNull()
  for (const status of ['private', 'draft', 'cancelled', 'postponed', 'archived'] as const)
    expect(appearanceTimeState({ ...row, status }, now)).toBeNull()
  expect(appearanceIsDiscoverable({ ...row, status: 'private' }, now)).toBe(false)
})
