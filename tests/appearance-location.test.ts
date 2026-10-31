import { describe, expect, it } from 'vitest'
import { appearanceGoogleMapsUrl, resolveAppearanceLocation } from '../src/platform/lib/appearanceLocation'
import { appearanceMapState } from '../src/platform/lib/appearanceMap'
import { rankNearbyAppearances } from '../src/platform/lib/nearbyAppearances'
import type { Performer, PerformerAppearance } from '../src/platform/lib/types'
const row = (input: Partial<PerformerAppearance> = {}) => ({ venue_lat: null, venue_lng: null, venue_name: 'ランドマークタワー', venue_address: '', region: '', country: 'Japan', status: 'published', starts_at: '2026-11-01T03:00:00Z', ends_at: '2026-11-01T04:00:00Z', ...input } as PerformerAppearance)
describe('reviewed appearance representatives', () => {
  it('resolves the four observed public venue descriptions without mutating their rows', () => {
    const rows = [row(), row({ venue_name: 'Yokohama' }), row({ venue_name: '福島県南相馬市駅前通', region: '福島県南相馬市' }), row({ venue_name: '大須ふれあい広場', venue_address: '愛知県名古屋市中区 大須3丁目26', region: '愛知県名古屋市' })]
    for (const source of rows) {
      expect(resolveAppearanceLocation(source)?.precision).toBe('approximate')
      expect(source.venue_lat).toBeNull()
      expect(source.venue_lng).toBeNull()
    }
    expect(resolveAppearanceLocation(rows[1])?.label).toContain('代表地点')
    expect(resolveAppearanceLocation(rows[3])?.label).toContain('住所の概略')
  })
  it('prefers explicit coordinates, even when a reviewed place name matches', () => {
    expect(resolveAppearanceLocation(row({ venue_lat: 35.7, venue_lng: 139.7 }))).toMatchObject({ lat: 35.7, lng: 139.7, precision: 'registered' })
  })
  it('refuses unknown, contradictory, partial, and invalid locations', () => {
    for (const source of [row({ venue_name: '公園' }), row({ region: '大阪市' }), row({ country: 'Canada' }), row({ venue_lat: 35.7 }), row({ venue_lat: NaN, venue_lng: 139 }), row({ venue_name: '大須ふれあい広場' }), row({ venue_name: 'ランドマークタワー別館' }), row({ venue_name: '福島県南相馬市駅前通', region: '横浜市' })]) expect(resolveAppearanceLocation(source)).toBeNull()
  })
  it('keeps cancelled, private, postponed, archived and expired representatives off MAP', () => {
    const now = new Date('2026-11-01T03:30:00Z')
    expect(appearanceMapState(row(), now)).toBe('performance-window')
    for (const status of ['cancelled', 'private', 'postponed', 'draft', 'archived'] as const) expect(appearanceMapState(row({ status }), now)).toBeNull()
    expect(appearanceMapState(row(), new Date('2026-11-01T04:00:00Z'))).toBeNull()
    expect(appearanceMapState(row({ ends_at: null }), now)).toBeNull()
    expect(appearanceMapState(row({ ends_at: 'bad' }), new Date('2026-10-31'))).toBeNull()
  })
  it('uses a venue search for approximate locations, and coordinate directions only for registered locations', () => {
    const approximate = new URL(appearanceGoogleMapsUrl(row()))
    expect(approximate.pathname).toBe('/maps/search/')
    expect(approximate.searchParams.get('query')).toContain('ランドマークタワー')
    expect(approximate.searchParams.has('destination')).toBe(false)
    expect(new URL(appearanceGoogleMapsUrl(row({ venue_lat: 35.7, venue_lng: 139.7 }))).searchParams.get('destination')).toBe('35.7,139.7')
  })
  it('ranks a representative and a registered position without using a performer location', () => {
    const marker = { appearance: row(), performer: { lat: 0, lng: 0 } as Performer, overlapsLive: false }
    const found = rankNearbyAppearances([marker], { lat: 35.455093, lng: 139.631454 }, '')
    expect(found[0].distance).toBe(0)
    expect(rankNearbyAppearances([{ ...marker, appearance: row({ venue_name: 'Yokohama' }) }], null, '横浜')).toHaveLength(1)
    expect(rankNearbyAppearances([{ ...marker, appearance: row({ venue_name: 'unknown' }) }], null, '')).toEqual([])
  })
})
