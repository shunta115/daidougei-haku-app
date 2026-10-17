import { afterEach, describe, expect, it } from 'vitest'
import { getStripe, stripeMode } from '../api/stripe/_shared'

const original = {
  key: process.env.STRIPE_SECRET_KEY,
  vercel: process.env.VERCEL_ENV,
  allow: process.env.STRIPE_ALLOW_LIVE,
}

afterEach(() => {
  process.env.STRIPE_SECRET_KEY = original.key
  process.env.VERCEL_ENV = original.vercel
  process.env.STRIPE_ALLOW_LIVE = original.allow
})

describe('Stripe environment isolation', () => {
  it('identifies test mode without exposing the key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'
    expect(stripeMode()).toBe('test')
  })

  it('rejects live keys in preview even if the live override is present', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_fixture'
    process.env.VERCEL_ENV = 'preview'
    process.env.STRIPE_ALLOW_LIVE = 'true'
    expect(() => getStripe()).toThrow('forbidden outside production')
  })
})
