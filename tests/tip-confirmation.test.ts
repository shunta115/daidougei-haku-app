import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const fake = vi.hoisted(() => ({
  row: null as { status: string; performer_id: string } | null,
  error: null as object | null,
  select: vi.fn(), eq: vi.fn(), from: vi.fn(),
}))
vi.mock('../api/stripe/_shared.js', () => ({ getAdminSupabase: () => ({ from: fake.from }) }))
import handler from '../api/stripe/confirm'

const sessionId = 'cs_test_1234567890abcdefghijklmn'
async function request(body: unknown = { sessionId }, headers: Record<string, string> = {}, method = 'POST') {
  const res = {
    code: 0, body: {} as Record<string, unknown>, setHeader: vi.fn(),
    status(code: number) { this.code = code; return this },
    json(body: Record<string, unknown>) { this.body = body; return this },
  }
  await handler({ method, body, headers: { host: 'haku.example', origin: 'https://haku.example', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers } } as VercelRequest, res as unknown as VercelResponse)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.row = { status: 'succeeded', performer_id: 'performer-verified' }
  fake.error = null
  fake.from.mockReturnValue({ select: fake.select })
  fake.select.mockReturnValue({ eq: fake.eq })
  fake.eq.mockImplementation(() => ({ maybeSingle: async () => ({ data: fake.row, error: fake.error }) }))
})

describe('read-only tip receipt confirmation', () => {
  it.each([{}, { authorization: 'Bearer signed-in-user-token' }])('works for guest and signed-in returns: %j', async (headers) => {
    const res = await request({ sessionId }, headers)
    expect(res.code).toBe(200)
    expect(res.body).toEqual({ ok: true, status: 'paid', performerId: 'performer-verified' })
    expect(fake.from).toHaveBeenCalledWith('tips')
    expect(fake.select).toHaveBeenCalledWith('status,performer_id')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it.each(['pending', 'failed', 'refunded', 'expired'])('never confirms %s receipts', async (status) => {
    fake.row!.status = status
    const res = await request()
    expect(res.body.ok).toBe(false)
    expect(res.body).not.toHaveProperty('performerId')
  })

  it('does not confirm a fabricated session', async () => {
    fake.row = null
    expect((await request()).body).toEqual({ ok: false, status: 'pending' })
  })

  it.each([{}, { sessionId: '' }, { sessionId: 123 }, { sessionId: 'cs_test_short' }])('rejects invalid input %j', async (body) => {
    expect((await request(body)).code).toBe(400)
    expect(fake.from).not.toHaveBeenCalled()
  })

  it.each([{ origin: '' }, { origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { 'content-type': 'text/plain' }])('rejects unsafe request %j', async (headers) => {
    expect((await request({ sessionId }, headers)).code).toBe(403)
    expect(fake.from).not.toHaveBeenCalled()
  })
})
