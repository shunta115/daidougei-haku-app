import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  user: { id: 'host-1' } as { id: string } | null,
  session: { id: '11111111-1111-4111-8111-111111111111', performer_id: 'host-1', ended_at: '2026-10-28T00:00:00Z' } as
    { id: string; performer_id: string; ended_at: string | null } | null,
  close: vi.fn(),
}))

vi.mock('../api/stripe/_shared', () => ({
  requireAuthUser: vi.fn(async () => fixture.user),
  getAdminSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: fixture.session, error: null }) }),
      }),
    }),
  }),
}))
vi.mock('../api/livekit/_close', () => ({ closeSessionRoom: fixture.close }))

import handler from '../api/livekit/close'

function response() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
  return res
}

describe('ended LIVE room closure authorization', () => {
  beforeEach(() => {
    fixture.user = { id: 'host-1' }
    fixture.session = {
      id: '11111111-1111-4111-8111-111111111111',
      performer_id: 'host-1',
      ended_at: '2026-10-28T00:00:00Z',
    }
    fixture.close.mockReset().mockResolvedValue({ revoked: 1 })
  })

  it('refuses another performer’s session', async () => {
    fixture.session!.performer_id = 'someone-else'
    const res = response()
    await handler({ method: 'POST', body: { sessionId: fixture.session!.id } } as never, res as never)
    expect(res.statusCode).toBe(404)
    expect(fixture.close).not.toHaveBeenCalled()
  })

  it('refuses to close a session that is still live', async () => {
    fixture.session!.ended_at = null
    const res = response()
    await handler({ method: 'POST', body: { sessionId: fixture.session!.id } } as never, res as never)
    expect(res.statusCode).toBe(409)
    expect(fixture.close).not.toHaveBeenCalled()
  })

  it('closes only the authenticated performer’s ended session', async () => {
    const res = response()
    await handler({ method: 'POST', body: { sessionId: fixture.session!.id } } as never, res as never)
    expect(res.statusCode).toBe(200)
    expect(fixture.close).toHaveBeenCalledWith('host-1', fixture.session!.id)
  })
})
