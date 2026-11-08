import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  performerPatch: null as Record<string, unknown> | null,
  sessionPatch: null as Record<string, unknown> | null,
  performerId: null as string | null,
  sessionPerformerId: null as string | null,
  profilePatch: null as Record<string, unknown> | null,
  profileError: null as { message: string } | null,
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
        if (table === 'profiles') {
          fake.profilePatch = patch
          return { eq: async () => ({ error: fake.profileError }) }
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

import { approvePerformer, unpublishPerformer } from '../src/platform/lib/api'

beforeEach(() => {
  fake.performerPatch = null
  fake.sessionPatch = null
  fake.performerId = null
  fake.sessionPerformerId = null
  fake.profilePatch = null
  fake.profileError = null
})

afterEach(() => vi.unstubAllGlobals())

it('routes legacy approval through the guarded cockpit API', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  vi.stubGlobal('fetch', request)
  await approvePerformer('performer-1')
  expect(request).toHaveBeenCalledWith('/api/ops/inbox', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ resource: 'performers', action: 'approve', payload: { id: 'performer-1' } }),
  }))
  expect(fake.performerPatch).toBeNull()
  expect(fake.profilePatch).toBeNull()
})

it('reports a blocked approval without attempting a direct database write', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'account unavailable' }) }))
  await expect(approvePerformer('performer-1')).rejects.toThrow('account unavailable')
  expect(fake.performerPatch).toBeNull()
  expect(fake.profilePatch).toBeNull()
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
