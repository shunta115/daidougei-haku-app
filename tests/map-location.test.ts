import { describe, expect, it } from 'vitest'
import { distanceKm, formatMapDistance, isFreshLiveLocation, walkingMinutes } from '../src/platform/lib/mapLocation'
import type { Performer } from '../src/platform/lib/types'

function performer(patch: Partial<Performer> = {}): Performer {
  return {
    id: 'performer-1',
    stage_name: 'SUI',
    bio: '',
    genre: 'Juggling',
    country: 'Japan',
    city: 'Tokyo',
    photo_url: null,
    support_blurb: '',
    stripe_account_id: null,
    stripe_onboarding_complete: false,
    is_approved: true,
    is_live: true,
    live_started_at: null,
    live_title: null,
    stream_url: null,
    share_location: true,
    lat: 35.7508,
    lng: 139.6375,
    location_updated_at: '2026-09-23T00:00:00.000Z',
    created_at: '',
    updated_at: '',
    ...patch,
  }
}

describe('LIVE map location rules', () => {
  const now = new Date('2026-09-23T00:01:00.000Z').getTime()

  it('shows only live, opted-in, fresh coordinates', () => {
    expect(isFreshLiveLocation(performer(), now)).toBe(true)
    expect(isFreshLiveLocation(performer({ is_live: false }), now)).toBe(false)
    expect(isFreshLiveLocation(performer({ share_location: false }), now)).toBe(false)
    expect(isFreshLiveLocation(performer({ location_updated_at: '2026-09-22T23:59:00.000Z' }), now)).toBe(false)
    expect(isFreshLiveLocation(performer({ lat: null }), now)).toBe(false)
  })

  it('calculates distance labels and walking estimates', () => {
    const km = distanceKm({ lat: 35.7508, lng: 139.6375 }, { lat: 35.7528, lng: 139.6375 })
    expect(km).toBeGreaterThan(.2)
    expect(km).toBeLessThan(.25)
    expect(formatMapDistance(km)).toMatch(/m$/)
    expect(walkingMinutes(km)).toBeGreaterThanOrEqual(2)
  })
})
