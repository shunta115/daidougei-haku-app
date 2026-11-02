import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const state = vi.hoisted(() => ({
  user: { id: 'fan-id' } as { id: string } | null,
  admin: { id: 'admin-id', adminPermission: 'super_admin' } as { id: string; adminPermission: string } | null,
  rpc: vi.fn(), ban: vi.fn(), from: vi.fn(),
}))
vi.mock('../api/stripe/_shared.js', () => ({
  getAdminSupabase: () => ({ rpc: state.rpc, from: state.from, auth: { admin: { updateUserById: state.ban } } }),
  requireAuthUser: async (_req: unknown, res: VercelResponse) => { if (!state.user) res.status(401).json({}); return state.user },
  getStripe: vi.fn(), isConnectedAccountTransferReady: vi.fn(),
}))
vi.mock('../api/ops/_guard.js', () => ({
  requireAdmin: async (_req: unknown, res: VercelResponse) => { if (!state.admin) res.status(403).json({}); return state.admin },
  requireSuperAdmin: vi.fn(), tokyoDay: () => '2026-11-02', prevTokyoDay: () => '2026-11-01',
}))
import inbox from '../api/ops/inbox'
import adminHandler from '../api/ops/_hakuAdmin'
function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() } as unknown as VercelResponse
}
const req = (body: object) => ({ method: 'POST', headers: {}, query: {}, body }) as VercelRequest
beforeEach(() => {
  vi.clearAllMocks(); state.user = { id: 'fan-id' }; state.admin = { id: 'admin-id', adminPermission: 'super_admin' }
  state.rpc.mockResolvedValue({ error: null }); state.ban.mockResolvedValue({ error: null })
})
describe('existing-account performer application', () => {
  it('uses the verified user ID and ignores a forged target from the browser', async () => {
    const res = response()
    await inbox(req({ resource: 'performer-application', action: 'apply', payload: { id: 'victim' } }), res)
    expect(state.rpc).toHaveBeenCalledWith('apply_fan_performer', { p_user_id: 'fan-id', p_actor_id: 'fan-id' })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(state.ban).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated applications without writes', async () => {
    state.user = null; const res = response()
    await inbox(req({ resource: 'performer-application', action: 'apply' }), res)
    expect(res.status).toHaveBeenCalledWith(401); expect(state.rpc).not.toHaveBeenCalled()
  })
  it('rejects non-admin access to every sensitive cockpit action', async () => {
    state.admin = null
    for (const action of ['apply-performer', 'suspend', 'soft-delete', 'list']) {
      const res = response(); await adminHandler(req({ resource: 'users', action, payload: { id: 'fan-id' } }), res)
      expect(res.status).toHaveBeenCalledWith(403)
    }
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.ban).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled()
  })
  it('passes the verified admin as the actor without modifying Auth', async () => {
    const res = response(); await adminHandler(req({ resource: 'users', action: 'apply-performer', payload: { id: 'fan-id' } }), res)
    expect(state.rpc).toHaveBeenCalledWith('apply_fan_performer', { p_user_id: 'fan-id', p_actor_id: 'admin-id' })
    expect(state.ban).not.toHaveBeenCalled()
  })
  it('does not report success when the transactional application fails', async () => {
    state.rpc.mockResolvedValueOnce({ error: { message: 'inactive' } }); const res = response()
    await inbox(req({ resource: 'performer-application', action: 'apply' }), res)
    expect(res.status).toHaveBeenCalledWith(409)
  })
})

describe('UUID based account restriction', () => {
  function mockDatabase(role = 'fan') {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
    state.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }) }),
      update, insert: vi.fn(async () => ({ error: null })),
    }))
    return update
  }
  it.each(['suspend', 'soft-delete'])('%s uses Auth ban by UUID and never passes a UUID as JWT', async action => {
    mockDatabase(); const res = response()
    await adminHandler(req({ resource: 'users', action, payload: { id: 'fan-id' } }), res)
    expect(state.ban).toHaveBeenCalledWith('fan-id', { ban_duration: '876000h' })
    expect(res.status).toHaveBeenCalledWith(200)
  })
  it('does not change profile state if Auth restriction fails', async () => {
    const update = mockDatabase(); state.ban.mockResolvedValueOnce({ error: new Error('Auth unavailable') }); const res = response()
    await adminHandler(req({ resource: 'users', action: 'suspend', payload: { id: 'fan-id' } }), res)
    expect(update).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(500)
  })
  it('does not bypass administrator lifecycle protections using the users panel', async () => {
    mockDatabase('admin'); const res = response()
    await adminHandler(req({ resource: 'users', action: 'suspend', payload: { id: 'other-admin' } }), res)
    expect(state.ban).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(409)
  })
})
