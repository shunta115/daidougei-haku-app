import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ user: 'owner', rows: [] as any[], claimed: false, dbError: false, send: vi.fn(), filters: [] as any[], inserts: 0 }))
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: state.send } }))
vi.mock('../api/stripe/_shared.js', () => ({
  requireAuthUser: async (_: unknown, res: any) => { if (!state.user) { res.status(401).json({}); return null }; return { id: state.user } },
  getAdminSupabase: () => ({ from: (table: string) => {
    const chain: any = { select: () => chain, eq: (...args: any[]) => { state.filters.push(args); return chain }, is: (...args: any[]) => { state.filters.push(args); return chain }, limit: async () => ({ data: state.rows, error: null }),
      insert: async () => { state.inserts++; if (state.dbError) return { error: { code: '08006' } }; if (state.claimed) return { error: { code: '23505' } }; state.claimed = true; return { error: null } },
      update: () => chain, then: (resolve: any) => resolve({ error: null }),
    }; expect(['push_subscriptions', 'platform_settings']).toContain(table); return chain
  } }),
}))
import handler from '../api/notifications/self-test'
async function call(body: any = { confirm: 'send_one_self_test' }, method = 'POST') {
  const res: any = { code: 0, body: null, setHeader: vi.fn(), status(code: number) { this.code = code; return this }, json(body: unknown) { this.body = body; return this } }
  await handler({ method, body } as any, res); return res
}
beforeEach(() => {
  vi.stubEnv('ENABLE_SELF_PUSH_TEST', 'true'); vi.stubEnv('SELF_PUSH_TEST_USER_ID', 'owner'); vi.stubEnv('SELF_PUSH_TEST_SUBSCRIPTION_ID', 'phone')
  for (const key of ['WEB_PUSH_SUBJECT', 'WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY']) vi.stubEnv(key, 'test-only')
  state.user = 'owner'; state.claimed = false; state.dbError = false; state.inserts = 0; state.filters = []; state.send.mockReset().mockResolvedValue({ statusCode: 201 })
  state.rows = [{ id: 'phone', endpoint: 'https://web.push.apple.com/test', p256dh: 'fake', auth: 'fake' }]
})
it('sends once to the pinned owner subscription and exact title', async () => {
  expect((await call()).code).toBe(200); expect(state.send).toHaveBeenCalledTimes(1)
  expect(state.filters).toContainEqual(['user_id', 'owner']); expect(state.filters).toContainEqual(['disabled_at', null])
  expect(JSON.parse(state.send.mock.calls[0][1]).title).toBe('HAKUプッシュ通知テスト')
})
it('serializes simultaneous requests and blocks replay', async () => {
  const responses = await Promise.all([call(), call(), call()]); expect(responses.map(r => r.code).sort()).toEqual([200,409,409]); expect(state.send).toHaveBeenCalledTimes(1)
})
it('does not retry uncertain provider failure', async () => {
  state.send.mockRejectedValue(new Error('sensitive provider response'))
  expect((await call()).code).toBe(502); expect((await call()).code).toBe(409); expect(state.send).toHaveBeenCalledTimes(1)
})
it('fails closed on claim database errors', async () => { state.dbError = true; expect((await call()).code).toBe(503); expect(state.send).not.toHaveBeenCalled() })
it.each(['', 'someone-else'])('rejects unauthenticated/other users: %s', async user => { state.user = user; expect([401,403]).toContain((await call()).code); expect(state.inserts).toBe(0) })
it('requires explicit enablement and confirmation', async () => {
  expect((await call({})).code).toBe(400); vi.stubEnv('ENABLE_SELF_PUSH_TEST','false'); expect((await call()).code).toBe(503); expect(state.inserts).toBe(0)
})
it('rejects arbitrary targets and GET', async () => {
  expect((await call({ confirm:'send_one_self_test', user_id:'other' })).code).toBe(400); expect((await call(undefined,'GET')).code).toBe(405); expect(state.inserts).toBe(0)
})
it.each([[], [{ id:'other' }], [{ id:'phone' }, { id:'other' }]])('requires exactly the pinned subscription: %j', async rows => { state.rows = rows; expect((await call()).code).toBe(409); expect(state.inserts).toBe(0) })
it('rejects non-Apple endpoints', async () => { state.rows[0].endpoint='https://example.com/test'; expect((await call()).code).toBe(409); expect(state.inserts).toBe(0) })
