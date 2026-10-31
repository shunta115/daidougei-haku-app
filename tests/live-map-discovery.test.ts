import { describe, expect, it } from 'vitest'
import { discoverMapLives } from '../src/platform/lib/liveMapDiscovery'
import type { Performer, PerformerAppearance } from '../src/platform/lib/types'
const now = Date.parse('2026-10-31T04:42:00Z')
const haribow = { id: 'haribow', stage_name: 'HARIBOW', is_approved: true, is_live: true, is_private_test: false, share_location: true, lat: null, lng: null, location_updated_at: null } as Performer
const appearance = { id: 'a', performer_id: 'haribow', status: 'published', starts_at: '2026-10-31T04:00:00Z', ends_at: '2026-10-31T05:00:00Z', venue_name: '公開会場', venue_lat: 35.7, venue_lng: 139.7 } as PerformerAppearance

describe('MAP LIVE discovery', () => {
  it('keeps the production HARIBOW missing-GPS case watchable without inventing coordinates', () => {
    const result = discoverMapLives([haribow], [], now)
    expect(result.live).toEqual([haribow]); expect(result.markers).toEqual([])
  })
  it('tracks start and end independently of GPS for every performer', () => {
    for (const id of ['haribow', 'other']) {
      expect(discoverMapLives([{ ...haribow, id, is_live: false }], [], now).live).toHaveLength(0)
      expect(discoverMapLives([{ ...haribow, id }], [], now).live).toHaveLength(1)
      expect(discoverMapLives([{ ...haribow, id, is_live: false }], [appearance], now).markers).toHaveLength(0)
    }
  })
  it('never includes private or unapproved LIVE even for an authenticated owner/admin', () => {
    expect(discoverMapLives([{ ...haribow, is_private_test: true }, { ...haribow, is_approved: false }], [appearance], now).live).toEqual([])
  })
  it('prefers fresh shared coordinates, and keeps stale or refused GPS in the list', () => {
    const fresh = { ...haribow, lat: 36, lng: 140, location_updated_at: new Date(now).toISOString() }
    expect(discoverMapLives([fresh], [appearance], now).markers[0]).toEqual(fresh)
    for (const p of [{ ...fresh, share_location: false }, { ...fresh, location_updated_at: new Date(now - 91_000).toISOString() }, { ...fresh, lat: 100 }]) {
      const result = discoverMapLives([p], [], now)
      expect(result.live).toHaveLength(1); expect(result.markers).toHaveLength(0)
    }
  })
  it('uses only one ongoing public venue as explicitly approximate without mutating data', () => {
    const result = discoverMapLives([haribow], [appearance], now)
    expect(result.markers[0]).toMatchObject({ lat: 35.7, lng: 139.7, liveMapLabel: expect.stringContaining('概略位置') })
    expect(haribow.lat).toBeNull()
    for (const a of [{ ...appearance, status: 'draft' }, { ...appearance, status: 'cancelled' }, { ...appearance, starts_at: '2026-10-31T05:00:00Z' }, { ...appearance, ends_at: '2026-10-31T04:42:00Z' }, { ...appearance, ends_at: null }, { ...appearance, venue_lat: null, venue_lng: null, venue_name: '不明' }]) {
      expect(discoverMapLives([haribow], [a as PerformerAppearance], now).markers).toEqual([])
    }
    expect(discoverMapLives([haribow], [appearance, { ...appearance, id: 'b' }], now).markers).toEqual([])
  })
})
