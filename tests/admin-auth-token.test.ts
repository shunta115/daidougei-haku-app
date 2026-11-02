import { beforeEach, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const fake = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), create: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => {
  fake.create(...args)
  return { auth: { getUser: fake.getUser }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: fake.profile }) }) }) }
} }))
import { requireAuthUser } from '../api/stripe/_shared'
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() }) as unknown as VercelResponse
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SUPABASE_URL', 'https://test.example.invalid'); vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service')
  fake.getUser.mockResolvedValue({ data: { user: { id: 'test-user', user_metadata: { role: 'admin' } } }, error: null })
  fake.profile.mockResolvedValue({ data: { status: 'active' }, error: null })
})
it.each([undefined, 'Bearer user-uuid', 'Bearer undefined', 'Bearer a.b', 'Basic a.b.c'])('rejects malformed auth %s before contacting Auth', async authorization => {
  const res = response()
  expect(await requireAuthUser({ headers: { authorization } } as VercelRequest, res)).toBeNull()
  expect(res.status).toHaveBeenCalledWith(401); expect(fake.getUser).not.toHaveBeenCalled()
})
it('validates the bearer with Supabase Auth rather than trusting its shape', async () => {
  fake.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('bad signature') }); const res = response()
  expect(await requireAuthUser({ headers: { authorization: 'Bearer a.b.c' } } as VercelRequest, res)).toBeNull()
  expect(res.status).toHaveBeenCalledWith(401); expect(fake.profile).not.toHaveBeenCalled()
})
it.each(['suspended','deleted'])('blocks an otherwise valid JWT for %s profile', async status => {
  fake.profile.mockResolvedValueOnce({ data: { status }, error: null }); const res = response()
  expect(await requireAuthUser({ headers: { authorization: 'Bearer a.b.c' } } as VercelRequest, res)).toBeNull()
  expect(res.status).toHaveBeenCalledWith(403)
})
it('accepts an active verified account without altering its login', async () => {
  const res = response()
  expect((await requireAuthUser({ headers: { authorization: 'Bearer a.b.c' } } as VercelRequest, res))?.id).toBe('test-user')
  expect(fake.create).toHaveBeenCalledWith('https://test.example.invalid', 'test-anon', { global: { headers: { Authorization: 'Bearer a.b.c' } } })
})
