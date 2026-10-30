// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  from: vi.fn(), authHeaders: vi.fn(), permission: vi.fn(), unsubscribe: vi.fn(),
  subscribe: vi.fn(), getSubscription: vi.fn(), fetch: vi.fn(), updates: [] as Record<string, unknown>[],
  preference: { appearance_in_app_enabled: false, appearance_push_enabled: true, live_push_enabled: true },
  schemaAvailable: true,
}))
vi.mock('../src/platform/lib/supabase', () => ({
  requireSupabase: () => ({ from: mock.from }),
  supabaseAuthHeaders: mock.authHeaders,
  isSupabaseConfigured: false,
  supabase: null,
}))

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  mock.updates.length = 0
  mock.preference = { appearance_in_app_enabled: false, appearance_push_enabled: true, live_push_enabled: true }
  mock.schemaAvailable = true
  vi.stubEnv('VITE_ENABLE_LIVE_START_WEB_PUSH', 'true')
  vi.stubEnv('VITE_WEB_PUSH_PUBLIC_KEY', 'AQIDBA')
  mock.authHeaders.mockResolvedValue({ Authorization: 'Bearer test-token' })
  mock.permission.mockResolvedValue('granted')
  const subscription = { toJSON: () => ({ endpoint: 'https://push.example.test/local', keys: { p256dh: 'test', auth: 'test' } }), unsubscribe: mock.unsubscribe }
  mock.getSubscription.mockResolvedValue(subscription)
  mock.subscribe.mockResolvedValue(subscription)
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: mock.getSubscription, subscribe: mock.subscribe } }) } })
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Test Desktop Browser' })
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Test' })
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: mock.permission })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('fetch', mock.fetch)
  mock.from.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = { error: null }
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({ data: { ...mock.preference }, error: mock.schemaAvailable ? null : { code: '42703' } }))
    builder.upsert = vi.fn(async () => ({ error: null }))
    builder.update = vi.fn((patch: Record<string, unknown>) => {
      if (table === 'notification_preferences') { mock.updates.push(patch); Object.assign(mock.preference, patch) }
      return builder
    })
    return builder
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

async function api() { return import('../src/platform/lib/api') }

describe('optional LIVE Push client connection', () => {
  it('does nothing when the client feature flag is OFF', async () => {
    vi.stubEnv('VITE_ENABLE_LIVE_START_WEB_PUSH', '')
    const client = await api()
    await client.dispatchLiveStartPush('test-session')
    expect(await client.getLivePushPreference('test-user')).toEqual({ available: false, enabled: false })
    expect(mock.fetch).not.toHaveBeenCalled()
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('uses authenticated bounded batches and stops on a failed dispatch', async () => {
    const client = await api()
    mock.fetch.mockResolvedValue({ ok: true, json: async () => ({ remaining: true }) })
    await client.dispatchLiveStartPush('test-session')
    expect(mock.fetch).toHaveBeenCalledTimes(10)
    expect(mock.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(mock.fetch.mock.calls[0][1].body)).toEqual({ kind: 'live_start', liveSessionId: 'test-session' })
    mock.fetch.mockClear(); mock.fetch.mockResolvedValue({ ok: false })
    await client.dispatchLiveStartPush('test-session')
    expect(mock.fetch).toHaveBeenCalledOnce()
  })

  it('does not save LIVE consent when the optional schema is unavailable', async () => {
    mock.schemaAvailable = false
    const client = await api()
    await expect(client.enableLiveStartPush('test-user', 'ja')).rejects.toThrow('live_push_unavailable')
    expect(mock.updates).toHaveLength(0)
  })

  it('requests iPhone-compatible permission before the first network await', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: mock.permission })
    const client = await api()
    const pending = client.enableLiveStartPush('test-user', 'ja')
    expect(mock.permission).toHaveBeenCalledOnce()
    expect(mock.from).not.toHaveBeenCalled()
    await pending
  })

  it('changes only the selected category and keeps the shared subscription', async () => {
    const client = await api()
    await client.disableAppearancePush('test-user', 'ja')
    expect(mock.preference.live_push_enabled).toBe(true)
    expect(mock.updates[0]).not.toHaveProperty('live_push_enabled')
    mock.preference.appearance_push_enabled = true
    await client.disableLiveStartPush('test-user', 'ja')
    expect(mock.preference.appearance_push_enabled).toBe(true)
    expect(mock.updates[1]).not.toHaveProperty('appearance_push_enabled')
    expect(mock.unsubscribe).not.toHaveBeenCalled()
    expect(mock.from).not.toHaveBeenCalledWith('push_subscriptions')
  })

  it('reuses an existing subscription without enabling appearance consent', async () => {
    mock.preference.appearance_push_enabled = false
    const client = await api()
    await client.enableLiveStartPush('test-user', 'ja')
    expect(mock.preference.live_push_enabled).toBe(true)
    expect(mock.preference.appearance_push_enabled).toBe(false)
    expect(mock.preference.appearance_in_app_enabled).toBe(false)
    expect(mock.subscribe).not.toHaveBeenCalled()
    expect(mock.updates[0]).not.toHaveProperty('appearance_push_enabled')
  })

  it('requires the Home Screen web app before prompting on iPhone', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Safari' })
    const client = await api()
    await expect(client.enableLiveStartPush('test-user', 'ja')).rejects.toThrow('push_home_screen_required')
    expect(mock.permission).not.toHaveBeenCalled()
    expect(mock.getSubscription).not.toHaveBeenCalled()
  })
})
