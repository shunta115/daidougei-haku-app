import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  user: { id: 'performer-fixture' } as { id: string } | null,
  profile: { role: 'performer', status: 'pending' },
  performer: { stripe_account_id: 'acct_fixture', stripe_onboarding_complete: false },
  account: { id: 'acct_fixture', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { disabled_reason: null, currently_due: [], pending_verification: [] } },
  saveError: null as null | { message: string },
  update: vi.fn(), create: vi.fn(), retrieve: vi.fn(), link: vi.fn(),
}))

vi.mock('../api/stripe/_shared.js', () => ({
  requireAuthUser: vi.fn(async (_req, res) => { if (!fake.user) res.status(401).json({ error: 'Authorization required' }); return fake.user }),
  getAppUrl: () => 'https://app.example.test',
  isConnectedAccountChargeReady: (account: typeof fake.account) => Boolean(account.charges_enabled && account.payouts_enabled && account.details_submitted && !account.requirements.disabled_reason),
  getStripe: () => ({ accounts: { create: fake.create, retrieve: fake.retrieve }, accountLinks: { create: fake.link } }),
  getAdminSupabase: () => ({ from: (table: string) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: table === 'profiles' ? fake.profile : fake.performer, error: null }) }) }),
    update: (patch: unknown) => { fake.update(table, patch); return { eq: async () => ({ error: fake.saveError }) } },
  }) }),
}))

import handler from '../api/stripe/connect'
import type { VercelRequest, VercelResponse } from '@vercel/node'

async function request(body: object, method = 'POST') {
  const response = { code: 0, body: {} as Record<string, unknown>, status(code: number) { this.code = code; return this }, json(body: Record<string, unknown>) { this.body = body; return this }, setHeader: vi.fn() }
  await handler({ method, body, headers: {} } as VercelRequest, response as unknown as VercelResponse)
  return response
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.user = { id: 'performer-fixture' }
  fake.profile = { role: 'performer', status: 'pending' }
  fake.performer = { stripe_account_id: 'acct_fixture', stripe_onboarding_complete: false }
  fake.account = { id: 'acct_fixture', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { disabled_reason: null, currently_due: [], pending_verification: [] } }
  fake.saveError = null
  fake.retrieve.mockImplementation(async () => fake.account)
  fake.create.mockResolvedValue({ id: 'acct_new_fixture' })
  fake.link.mockResolvedValue({ url: 'https://connect.stripe.com/setup/fixture' })
})

describe('Stripe onboarding without payment changes', () => {
  it('requires authentication and ownership', async () => {
    fake.user = null
    expect((await request({ performerId: 'performer-fixture', action: 'status' })).code).toBe(401)
    fake.user = { id: 'other-user' }
    expect((await request({ performerId: 'performer-fixture' })).code).toBe(403)
    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.retrieve).not.toHaveBeenCalled()
  })
  it.each(['suspended', 'deleted'])('does not onboard %s users', async (status) => {
    fake.profile.status = status
    expect((await request({ performerId: 'performer-fixture' })).code).toBe(403)
  })
  it('never creates an account while checking an unregistered performer', async () => {
    fake.performer.stripe_account_id = ''
    const res = await request({ performerId: 'performer-fixture', action: 'status' })
    expect(res.body).toMatchObject({ connected: false, complete: false })
    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.link).not.toHaveBeenCalled()
    expect(fake.update).not.toHaveBeenCalled()
  })
  it('retrieves Stripe readiness and synchronizes only the existing flag', async () => {
    const res = await request({ performerId: 'performer-fixture', action: 'status' })
    expect(res.body).toMatchObject({ connected: true, complete: true })
    expect(fake.update).toHaveBeenCalledWith('performers', { stripe_onboarding_complete: true })
    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.link).not.toHaveBeenCalled()
    expect(JSON.stringify(res.body)).not.toContain('acct_fixture')
  })
  it('does not treat submitted details as completion when payouts are disabled', async () => {
    fake.account.payouts_enabled = false
    const res = await request({ performerId: 'performer-fixture', action: 'status' })
    expect(res.body.complete).toBe(false)
  })
  it('uses the same account and fresh return link for interrupted onboarding', async () => {
    const res = await request({ performerId: 'performer-fixture' })
    expect(res.code).toBe(200)
    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.link).toHaveBeenCalledWith(expect.objectContaining({ account: 'acct_fixture', return_url: 'https://app.example.test/live?stripe=return', refresh_url: 'https://app.example.test/live?stripe=refresh' }))
  })
  it('makes account creation idempotent while retaining the existing Connect controller', async () => {
    fake.performer.stripe_account_id = ''
    await request({ performerId: 'performer-fixture' })
    expect(fake.create).toHaveBeenCalledWith(expect.objectContaining({ controller: { fees: { payer: 'account' }, losses: { payments: 'stripe' }, requirement_collection: 'stripe', stripe_dashboard: { type: 'full' } } }), { idempotencyKey: 'performer-connect:performer-fixture' })
  })
  it('does not send users to an unpersisted account or expose database errors', async () => {
    fake.performer.stripe_account_id = ''
    fake.saveError = { message: 'private database detail' }
    const res = await request({ performerId: 'performer-fixture' })
    expect(res.code).toBe(500)
    expect(fake.link).not.toHaveBeenCalled()
    expect(JSON.stringify(res.body)).not.toContain('private database detail')
  })
})
