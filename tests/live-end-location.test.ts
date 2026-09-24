import { beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  performerPatch: null as Record<string, unknown> | null,
  sessionPatch: null as Record<string, unknown> | null,
}))

vi.mock('../src/platform/lib/supabase', () => ({
  requireSupabase: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        if (table === 'performers') {
          fake.performerPatch = patch
          return { eq: async () => ({ error: null }) }
        }
        fake.sessionPatch = patch
        return { eq: () => ({ is: async () => ({ error: null }) }) }
      },
    }),
  }),
  supabaseAuthHeaders: vi.fn(),
}))

vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn() }))

import { endLive } from '../src/platform/lib/api'

beforeEach(() => {
  fake.performerPatch = null
  fake.sessionPatch = null
})

it('clears public location sharing and coordinates when a LIVE ends', async () => {
  await endLive('performer-1')

  expect(fake.performerPatch).toMatchObject({
    is_live: false,
    share_location: false,
    lat: null,
    lng: null,
    location_updated_at: null,
  })
  expect(fake.sessionPatch).toEqual(expect.objectContaining({ ended_at: expect.any(String) }))
})
