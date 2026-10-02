import { beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  approved: false,
  status: 'pending',
  updates: [] as Record<string, unknown>[],
}))

vi.mock('../src/platform/lib/supabase', () => ({
  requireSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'performers') return { data: { is_approved: fake.approved, is_live: false, live_title: null } }
            if (table === 'profiles') return { data: { status: fake.status } }
            return { data: null }
          },
          is: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        fake.updates.push(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn() }))

import { startLive, updatePerformer } from '../src/platform/lib/api'

beforeEach(() => {
  fake.approved = false
  fake.status = 'pending'
  fake.updates = []
})

it('does not start LIVE when the performer is unapproved', async () => {
  await expect(startLive('performer-1')).rejects.toThrow('運営の承認後にLIVEを開始できます')
  expect(fake.updates).toEqual([])
})

it('does not start LIVE when the account is not active', async () => {
  fake.approved = true
  fake.status = 'pending'
  await expect(startLive('performer-1')).rejects.toThrow('運営の承認後にLIVEを開始できます')
  expect(fake.updates).toEqual([])
})

it('does not flip is_live through a direct performer update when unapproved', async () => {
  await expect(updatePerformer('performer-1', { is_live: true })).rejects.toThrow('運営の承認後にLIVEを開始できます')
  expect(fake.updates).toEqual([])
})
