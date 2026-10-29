import { describe, expect, it } from 'vitest'
import { rankNearbyAppearances, type AppearanceMarker } from '../src/platform/lib/nearbyAppearances'

const marker = (id: string, lat: number, lng: number, region: string): AppearanceMarker => ({
  overlapsLive: false,
  performer: { id, stage_name: id, bio: '', genre: '', country: '', city: '', photo_url: null, support_blurb: '', stripe_account_id: null, stripe_onboarding_complete: false, is_approved: true, is_live: false, live_started_at: null, live_title: null, stream_url: null, share_location: false, lat: null, lng: null, location_updated_at: null, created_at: '', updated_at: '' },
  appearance: { id, performer_id: id, title: id, performance_date: '2026-10-30', start_time: '10:00', end_time: '11:00', timezone: 'Asia/Tokyo', starts_at: `2026-10-30T0${id === 'near' ? 1 : 2}:00:00Z`, ends_at: '2026-10-30T03:00:00Z', venue_name: `${region}公園`, venue_address: '', venue_lat: lat, venue_lng: lng, region, country: 'JP', description: '', admission_type: 'free', admission_details: '', image_url: null, ticket_url: null, is_live_planned: false, rain_policy: '', organizer_info: '', notes: '', status: 'published', published_at: '', cancelled_at: null, created_at: '', updated_at: '' },
})

describe('nearby appearance discovery', () => {
  it('sorts by distance when location permission is granted', () => {
    const rows = rankNearbyAppearances([marker('far', 36, 140, '千葉'), marker('near', 35.701, 139.7, '東京')], { lat: 35.7, lng: 139.7 }, '')
    expect(rows.map((row) => row.appearance.id)).toEqual(['near', 'far'])
  })

  it('falls back to region and venue search without a location', () => {
    const rows = rankNearbyAppearances([marker('tokyo', 35.7, 139.7, '東京'), marker('osaka', 34.7, 135.5, '大阪')], null, '大阪')
    expect(rows.map((row) => row.appearance.id)).toEqual(['osaka'])
    expect(rows[0]?.distance).toBeNull()
  })
})
