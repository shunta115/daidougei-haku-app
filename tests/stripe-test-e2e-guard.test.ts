import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stripeTestE2eEnvironmentIsSafe } from '../server/stripeTestE2e'

const saved = { ...process.env }

describe('Stripe external TEST E2E guard', () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = 'preview'
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'
    process.env.SUPABASE_URL = 'https://aeqskxxykzapgaudbeqa.supabase.co'
    process.env.STRIPE_TEST_CONNECTED_ACCOUNT_ID = 'acct_test_fixture'
    process.env.STRIPE_TEST_PERFORMER_ID = 'bf2f55e2-3499-45f9-a440-915b43048f77'
    process.env.STRIPE_TEST_E2E_EXPIRES_AT = '2026-10-20T15:30:00.000Z'
  })

  afterEach(() => {
    process.env = { ...saved }
  })

  it('allows only an unexpired Preview + TEST Stripe + TEST Supabase combination', () => {
    expect(stripeTestE2eEnvironmentIsSafe(Date.parse('2026-10-20T14:30:00.000Z'))).toBe(true)
  })

  it.each([
    ['production deployment', 'VERCEL_ENV', 'production'],
    ['live Stripe key', 'STRIPE_SECRET_KEY', 'sk_live_fixture'],
    ['production Supabase', 'SUPABASE_URL', 'https://pmmtijwswzwhuriqhlep.supabase.co'],
  ])('rejects %s', (_label, key, value) => {
    process.env[key] = value
    expect(stripeTestE2eEnvironmentIsSafe(Date.parse('2026-10-20T14:30:00.000Z'))).toBe(false)
  })

  it('rejects an expired test window', () => {
    expect(stripeTestE2eEnvironmentIsSafe(Date.parse('2026-10-20T15:30:00.000Z'))).toBe(false)
  })
})
