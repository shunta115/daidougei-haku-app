import { beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  performerPatch: null as Record<string, unknown> | null,
  sessionPatch: null as Record<string, unknown> | null,
  performerId: null as string | null,
  sessionPerformerId: null as string | null,
}))

vi.mock('../src/platform/lib/supabase', () => ({
  requireSupabase: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        if (table === 'performers') {
          fake.performerPatch = patch
          return {
            eq: (_column: string, id: string) => {
              fake.performerId = id
              return { select: async () => ({ data: [{ id }], error: null }) }
            },
          }
        }
        fake.sessionPatch = patch
        return {
          eq: (_column: string, id: string) => {
            fake.sessionPerformerId = id
            return { is: async () => ({ error: null }) }
          },
        }
      },
    }),
  }),
  supabaseAuthHeaders: vi.fn(),
}))

vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn() }))

import { unpublishPerformer } from '../src/platform/lib/api'

beforeEach(() => {
  fake.performerPatch = null
  fake.sessionPatch = null
  fake.performerId = null
  fake.sessionPerformerId = null
})

it('unpublishes a performer and removes any active LIVE location', async () => {
  await unpublishPerformer('performer-1')

  expect(fake.performerId).toBe('performer-1')
  expect(fake.performerPatch).toMatchObject({
    is_approved: false,
    is_live: false,
    share_location: false,
    live_started_at: null,
    live_title: null,
    lat: null,
    lng: null,
    location_updated_at: null,
  })
  expect(fake.sessionPerformerId).toBe('performer-1')
  expect(fake.sessionPatch).toEqual(expect.objectContaining({ ended_at: expect.any(String) }))
})
