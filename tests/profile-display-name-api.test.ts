import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  user: { id: 'authenticated-user' } as { id: string } | null,
  profile: { role: 'fan', display_name: 'Before' } as { role: string; display_name: string } | null,
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; id: string }>,
}))

vi.mock('../api/stripe/_shared.js', () => ({
  requireAuthUser: vi.fn(async () => fake.user),
  getAdminSupabase: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.profile, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async (_field: string, id: string) => {
        fake.updates.push({ table, patch, id })
        return { error: null }
      } }),
    }),
  }),
}))

import handler from '../api/profile/display-name'

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
}

beforeEach(() => {
  fake.user = { id: 'authenticated-user' }
  fake.profile = { role: 'fan', display_name: 'Before' }
  fake.updates = []
})

describe('display name API authorization', () => {
  it('updates only the authenticated fan profile even if extra identifiers are sent', async () => {
    const res = response()
    await handler({ method: 'POST', body: { displayName: 'Fan Name', userId: 'someone-else' }, headers: {} } as never, res as never)
    expect(res.statusCode).toBe(200)
    expect(fake.updates).toEqual([{ table: 'profiles', patch: { display_name: 'Fan Name' }, id: 'authenticated-user' }])
  })

  it('keeps the performer search/LIVE mirror aligned for the same authenticated id', async () => {
    fake.profile = { role: 'performer', display_name: 'Before' }
    const res = response()
    await handler({ method: 'POST', body: { displayName: 'Stage Name' }, headers: {} } as never, res as never)
    expect(fake.updates).toEqual([
      { table: 'profiles', patch: { display_name: 'Stage Name' }, id: 'authenticated-user' },
      { table: 'performers', patch: { stage_name: 'Stage Name' }, id: 'authenticated-user' },
    ])
  })

  it('rejects roles outside fan and performer without writing', async () => {
    fake.profile = { role: 'admin', display_name: 'Admin' }
    const res = response()
    await handler({ method: 'POST', body: { displayName: 'Changed' }, headers: {} } as never, res as never)
    expect(res.statusCode).toBe(403)
    expect(fake.updates).toEqual([])
  })
})
