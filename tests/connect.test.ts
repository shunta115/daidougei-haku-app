import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  user: { id: 'performer-fixture' } as { id: string } | null,
  profile: { role: 'performer', status: 'pending' },
  performer: { stripe_account_id: 'acct_fixture', stripe_onboarding_complete: false },
  account: { id: 'acct_fixture', charges_enabled: true, payouts_enabled: true, details_submitted: true, capabilities: { transfers: 'active' }, requirements: { disabled_reason: null, currently_due: [], past_due: [], pending_verification: [] } },
  saveError: null as null | { message: string },
  update: vi.fn(), stripeUpdate: vi.fn(), create: vi.fn(), retrieve: vi.fn(), list: vi.fn(), link: vi.fn(),
}))

vi.mock('../api/stripe/_shared.js', () => ({
  requireAuthUser: vi.fn(async (_req, res) => { if (!fake.user) res.status(401).json({ error: 'Authorization required' }); return fake.user }),
  getAppUrl: () => 'https://app.example.test',
  isConnectedAccountTransferReady: (account: typeof fake.account) => Boolean(account.capabilities.transfers === 'active' && account.payouts_enabled && account.details_submitted && !account.requirements.disabled_reason && !account.requirements.currently_due.length && !account.requirements.past_due.length && !account.requirements.pending_verification.length),
  getStripe: () => ({ accounts: { create: fake.create, retrieve: fake.retrieve, list: fake.list, update: fake.stripeUpdate }, accountLinks: { create: fake.link } }),
  getAdminSupabase: () => ({ from: (table: string) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: table === 'profiles' ? fake.profile : fake.performer, error: null }) }) }),
    update: (patch: unknown) => {
      fake.update(table, patch)
      const result = { error: fake.saveError }
      const chain = { eq: vi.fn(() => chain), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) }
      return chain
    },
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
  fake.account = { id: 'acct_fixture', charges_enabled: true, payouts_enabled: true, details_submitted: true, capabilities: { transfers: 'active' }, requirements: { disabled_reason: null, currently_due: [], past_due: [], pending_verification: [] } }
  fake.saveError = null
  fake.retrieve.mockImplementation(async () => fake.account)
  fake.create.mockImplementation(async () => ({ ...fake.account, id: 'acct_new_fixture', metadata: { performer_id: 'performer-fixture' } }))
  fake.stripeUpdate.mockImplementation(async (id, params) => ({ ...fake.account, id, metadata: { performer_id: 'performer-fixture', ...params.metadata } }))
  fake.list.mockImplementation(() => ({
    async *[Symbol.asyncIterator]() { /* no existing live accounts */ },
  }))
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
  it('distinguishes information required, review, and restricted states', async () => {
    fake.account.requirements.currently_due = ['individual.verification.document']
    expect((await request({ performerId: 'performer-fixture', action: 'status' })).body).toMatchObject({ complete: false, needsInformation: true, state: 'needs_information' })
    fake.account.requirements.currently_due = []
    fake.account.requirements.pending_verification = ['individual.verification.document']
    expect((await request({ performerId: 'performer-fixture', action: 'status' })).body).toMatchObject({ complete: false, underReview: true, state: 'under_review' })
    fake.account.requirements.pending_verification = []
    fake.account.requirements.disabled_reason = 'requirements.past_due'
    expect((await request({ performerId: 'performer-fixture', action: 'status' })).body).toMatchObject({ complete: false, restricted: true, state: 'restricted' })
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

  it('returns a safe error when Stripe account retrieval fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fake.retrieve.mockRejectedValueOnce({
      type: 'StripeInvalidRequestError',
      raw: { code: 'resource_missing', statusCode: 404, message: "No such account acct_private123 for sk_live_private456; contact private@example.com" },
    })
    const res = await request({ performerId: 'performer-fixture' })
    expect(res.code).toBe(500)
    expect(res.body).toMatchObject({ code: 'stripe_connect_error' })
    expect(JSON.stringify(res.body)).not.toContain('private@example.com')
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).toContain('acct_[redacted]')
    expect(logged).toContain('sk_[redacted]')
    expect(logged).not.toContain('acct_private123')
    expect(logged).not.toContain('sk_live_private456')
    expect(logged).not.toContain('private@example.com')
    log.mockRestore()
    expect(fake.link).not.toHaveBeenCalled()
  })

  it('keeps a live/test mismatch read-only during status refresh', async () => {
    fake.retrieve.mockRejectedValueOnce({
      type: 'StripeInvalidRequestError', statusCode: 400,
      raw: { statusCode: 400, message: "No such account; a similar object exists in test mode, but a live mode key was used." },
    })
    const res = await request({ performerId: 'performer-fixture', action: 'status' })
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ connected: false, state: 'not_started' })
    expect(fake.list).not.toHaveBeenCalled()
    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.update).not.toHaveBeenCalled()
  })

  it('reuses the single exact live metadata match after an explicit onboarding click', async () => {
    fake.retrieve.mockRejectedValueOnce({
      type: 'StripeInvalidRequestError', statusCode: 400,
      raw: { statusCode: 400, message: "No such account; a similar object exists in test mode, but a live mode key was used." },
    })
    fake.list.mockImplementationOnce(() => ({
      async *[Symbol.asyncIterator]() { yield { ...fake.account, id: 'acct_live_exact', metadata: { performer_id: 'performer-fixture' } } },
    }))
    const res = await request({ performerId: 'performer-fixture' })
    expect(res.code).toBe(200)
    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.stripeUpdate).toHaveBeenCalledWith('acct_live_exact', { metadata: { legacy_test_account_id: 'acct_fixture' } })
    expect(fake.update).toHaveBeenCalledWith('performers', { stripe_account_id: 'acct_live_exact', stripe_onboarding_complete: false })
    expect(fake.link).toHaveBeenCalledWith(expect.objectContaining({ account: 'acct_live_exact' }))
  })

  it('creates one idempotent live account when no exact match exists', async () => {
    fake.retrieve.mockRejectedValueOnce({
      type: 'StripeInvalidRequestError', statusCode: 400,
      raw: { statusCode: 400, message: "No such account; a similar object exists in test mode, but a live mode key was used." },
    })
    const res = await request({ performerId: 'performer-fixture' })
    expect(res.code).toBe(200)
    expect(fake.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: { performer_id: 'performer-fixture', legacy_test_account_id: 'acct_fixture' } }), { idempotencyKey: 'performer-connect:live:performer-fixture' })
    expect(fake.link).toHaveBeenCalledWith(expect.objectContaining({ account: 'acct_new_fixture' }))
  })

  it('stops instead of guessing when multiple live accounts match', async () => {
    fake.retrieve.mockRejectedValueOnce({
      type: 'StripeInvalidRequestError', statusCode: 400,
      raw: { statusCode: 400, message: "No such account; a similar object exists in test mode, but a live mode key was used." },
    })
    fake.list.mockImplementationOnce(() => ({
      async *[Symbol.asyncIterator]() {
        yield { ...fake.account, id: 'acct_live_a', metadata: { performer_id: 'performer-fixture' } }
        yield { ...fake.account, id: 'acct_live_b', metadata: { performer_id: 'performer-fixture' } }
      },
    }))
    const res = await request({ performerId: 'performer-fixture' })
    expect(res.code).toBe(500)
    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.update).not.toHaveBeenCalled()
    expect(fake.link).not.toHaveBeenCalled()
  })
})
