import { describe, expect, it } from 'vitest'
import { appearanceMapState, mapVisibleAppearances } from '../src/platform/lib/appearanceMap'
import type { PerformerAppearance } from '../src/platform/lib/types'

const base: PerformerAppearance = {
  id: 'a', performer_id: 'p', title: 'Show', performance_date: '2026-10-29',
  start_time: '10:00:00', end_time: '11:00:00', timezone: 'Asia/Tokyo',
  starts_at: '2026-10-29T01:00:00Z', ends_at: '2026-10-29T02:00:00Z',
  venue_name: 'Park', venue_address: '', venue_lat: 35.7, venue_lng: 139.7,
  region: 'Tokyo', country: 'JP', description: '', admission_type: 'free',
  admission_details: '', image_url: null, ticket_url: null, is_live_planned: false,
  rain_policy: '', organizer_info: '', notes: '', status: 'published', published_at: '',
  cancelled_at: null, created_at: '', updated_at: '',
}

describe('appearance MAP visibility', () => {
  it('marks a bounded active window as scheduled performance time', () => {
    expect(appearanceMapState(base, new Date('2026-10-29T01:30:00Z'))).toBe('performance-window')
  })

  it('never claims an active performance without an end time', () => {
    expect(appearanceMapState({ ...base, ends_at: null, end_time: null }, new Date('2026-10-29T01:30:00Z'))).toBe('scheduled')
  })

  it('uses a half-open start/end window and rejects malformed positions or timestamps', () => {
    expect(appearanceMapState(base, new Date(base.starts_at))).toBe('performance-window')
    expect(appearanceMapState(base, new Date(base.ends_at!))).toBeNull()
    expect(appearanceMapState({ ...base, starts_at: 'invalid' })).toBeNull()
    expect(appearanceMapState({ ...base, venue_lat: Number.NaN })).toBeNull()
    expect(appearanceMapState({ ...base, venue_lng: 181 })).toBeNull()
    expect(appearanceMapState({ ...base, status: 'postponed' })).toBeNull()
  })

  it('excludes cancelled, private, expired, and coordinate-less rows', () => {
    const now = new Date('2026-10-29T01:30:00Z')
    expect(mapVisibleAppearances([
      { ...base, id: 'cancelled', status: 'cancelled' },
      { ...base, id: 'private', status: 'private' },
      { ...base, id: 'expired', ends_at: '2026-10-29T01:00:00Z' },
      { ...base, id: 'no-coordinates', venue_lat: null, venue_lng: null },
    ], now)).toEqual([])
  })
})
