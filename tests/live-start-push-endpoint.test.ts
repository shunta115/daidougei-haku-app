import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/notifications/push'

const owner = '10000000-0000-4000-8000-000000000001'
const live = '50000000-0000-4000-8000-000000000005'
const event = '60000000-0000-4000-8000-000000000006'
const mock = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), rpc: vi.fn(), from: vi.fn(), send: vi.fn(), vapid: vi.fn(),
}))
vi.mock('../api/stripe/_shared.js', () => ({ requireAuthUser: mock.auth, getAdminSupabase: mock.admin }))
vi.mock('web-push', () => ({ default: { sendNotification: mock.send, setVapidDetails: mock.vapid } }))

function request(body: unknown) { return { method: 'POST', body } as VercelRequest }
function response() {
  const result = { code: 200, body: null as unknown, status: vi.fn(), json: vi.fn() }
  result.status.mockImplementation((code: number) => { result.code = code; return result })
  result.json.mockImplementation((body: unknown) => { result.body = body; return result })
  return result
}
const delivery = { delivery_id: 'delivery-test', subscription_id: 'subscription-test', endpoint: 'https://push.example.test/test', p256dh: 'test', auth: 'test', locale: 'ja', payload: { eventType: 'live_start', stageName: 'Test performer', url: `/?watch=${owner}` }, attempts: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ENABLE_LIVE_START_WEB_PUSH', '')
  vi.stubEnv('ENABLE_APPEARANCE_WEB_PUSH', '')
  vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:test@example.test')
  vi.stubEnv('WEB_PUSH_VAPID_PUBLIC_KEY', 'test-public-key')
  vi.stubEnv('WEB_PUSH_VAPID_PRIVATE_KEY', 'test-private-key')
  mock.auth.mockResolvedValue({ id: owner })
  mock.send.mockResolvedValue(undefined)
  mock.from.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.update = vi.fn(() => builder)
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: table === 'live_sessions' ? { id: live, performer_id: owner, ended_at: null } : { id: event, performer_id: owner }, error: null })
    return builder
  })
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'enqueue_live_start_push' ? event : [delivery], error: null }))
  mock.admin.mockReturnValue({ from: mock.from, rpc: mock.rpc })
})
afterEach(() => vi.unstubAllEnvs())

async function run(body: unknown) {
  const res = response()
  await handler(request(body), res as unknown as VercelResponse)
  return res
}

describe('optional LIVE start Web Push endpoint', () => {
  it('defaults OFF before reading optional schema or sending Push', async () => {
    const res = await run({ kind: 'live_start', liveSessionId: live })
    expect(res.code).toBe(202)
    expect(res.body).toEqual({ queued: false, dispatchEnabled: false })
    expect(mock.admin).not.toHaveBeenCalled()
    expect(mock.send).not.toHaveBeenCalled()
  })

  it('fails closed if the optional enqueue function is unavailable', async () => {
    vi.stubEnv('ENABLE_LIVE_START_WEB_PUSH', 'true')
    mock.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    const res = await run({ kind: 'live_start', liveSessionId: live })
    expect(res.code).toBe(503)
    expect(mock.send).not.toHaveBeenCalled()
  })

  it('rejects a request from someone other than the LIVE owner', async () => {
    vi.stubEnv('ENABLE_LIVE_START_WEB_PUSH', 'true')
    mock.auth.mockResolvedValue({ id: 'other-user' })
    const res = await run({ kind: 'live_start', liveSessionId: live })
    expect(res.code).toBe(403)
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.send).not.toHaveBeenCalled()
  })

  it('sends only claimed LIVE deliveries with a session tag and short TTL', async () => {
    vi.stubEnv('ENABLE_LIVE_START_WEB_PUSH', 'true')
    const res = await run({ kind: 'live_start', liveSessionId: live })
    expect(res.code).toBe(200)
    expect(mock.rpc).toHaveBeenCalledWith('enqueue_live_start_push', { p_live_session_id: live, p_owner_id: owner })
    expect(mock.rpc).toHaveBeenCalledWith('claim_live_start_push_deliveries', { p_event_id: event, p_limit: 100 })
    expect(mock.send).toHaveBeenCalledOnce()
    const payload = JSON.parse(mock.send.mock.calls[0][1])
    expect(payload.tag).toBe(`live-${live}`)
    expect(payload.url).toBe(`/?watch=${owner}`)
    expect(mock.send.mock.calls[0][2]).toEqual({ TTL: 60, urgency: 'normal' })
    expect(mock.from).toHaveBeenCalledWith('live_push_deliveries')
  })

  it('preserves the existing appearance queue and delivery TTL', async () => {
    vi.stubEnv('ENABLE_APPEARANCE_WEB_PUSH', 'true')
    const res = await run({ eventId: event })
    expect(res.code).toBe(200)
    expect(mock.rpc).toHaveBeenCalledWith('claim_appearance_push_deliveries', { p_event_id: event, p_limit: 100 })
    expect(mock.rpc).not.toHaveBeenCalledWith('enqueue_live_start_push', expect.anything())
    expect(mock.from).toHaveBeenCalledWith('push_notification_deliveries')
    expect(mock.send.mock.calls[0][2]).toEqual({ TTL: 86400, urgency: 'normal' })
  })
})
