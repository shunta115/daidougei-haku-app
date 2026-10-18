import { beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  approved: false,
  status: 'pending',
  stripeAccount: 'acct_fixture' as string | null,
  checkout: vi.fn(),
}))

vi.mock('../api/stripe/_shared.js', () => ({
  MIN_TIP_AMOUNT_YEN: 100,
  PLATFORM_FEE_BPS: 1500,
  calcPlatformFee: (amount: number) => Math.floor(amount * 0.15),
  getOptionalAuthUser: vi.fn(async () => null),
  getAppUrl: () => 'https://app.example.test',
  getIntSetting: vi.fn(async () => 100),
  requireConnectedAccountChargeReady: vi.fn(async () => ({ id: 'acct_fixture' })),
  getStripe: () => ({ checkout: { sessions: { create: fake.checkout } } }),
  getAdminSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: table === 'performers'
              ? { id: 'performer-1', is_approved: fake.approved, stripe_account_id: fake.stripeAccount, stripe_onboarding_complete: true }
              : { status: fake.status },
            error: null,
          }),
          maybeSingle: async () => ({ data: { status: fake.status }, error: null }),
        }),
      }),
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'tip-1' }, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

import handler from '../api/stripe/tip'
import type { VercelRequest, VercelResponse } from '@vercel/node'

async function request() {
  const response = {
    code: 0,
    body: {} as Record<string, unknown>,
    status(code: number) { this.code = code; return this },
    json(body: Record<string, unknown>) { this.body = body; return this },
    setHeader: vi.fn(),
  }
  await handler(
    { method: 'POST', body: { performerId: 'performer-1', amountYen: 1000 }, headers: {} } as VercelRequest,
    response as unknown as VercelResponse,
  )
  return response
}

beforeEach(() => {
  fake.approved = false
  fake.status = 'pending'
  fake.stripeAccount = 'acct_fixture'
  fake.checkout.mockReset()
  fake.checkout.mockResolvedValue({ id: 'cs_test_fixture1234567890', url: 'https://checkout.stripe.test/session' })
})

it('allows an approved active performer to receive a Platform tip before Connect onboarding', async () => {
  fake.approved = true
  fake.status = 'active'
  fake.stripeAccount = null
  const response = await request()
  expect(response.code).toBe(200)
  expect(response.body.url).toBe('https://checkout.stripe.test/session')
  expect(fake.checkout).toHaveBeenCalledTimes(1)
  const session = fake.checkout.mock.calls[0][0]
  expect(session.payment_intent_data.metadata).toMatchObject({ kind: 'tip', performer_id: 'performer-1', funding_model: 'platform_separate' })
  expect(session.payment_intent_data).not.toHaveProperty('application_fee_amount')
})

it('rejects a new tip checkout for an unapproved performer', async () => {
  const response = await request()
  expect(response.code).toBe(403)
  expect(response.body.code).toBe('performer_support_unavailable')
  expect(fake.checkout).not.toHaveBeenCalled()
})

it('rejects a new tip checkout when the performer account is not active', async () => {
  fake.approved = true
  fake.status = 'pending'
  const response = await request()
  expect(response.code).toBe(403)
  expect(response.body.code).toBe('performer_support_unavailable')
  expect(fake.checkout).not.toHaveBeenCalled()
})
