import { afterEach, describe, expect, it } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from '../api/ops/preview-readiness'

const original = {
  vercel: process.env.VERCEL_ENV,
  stripe: process.env.STRIPE_SECRET_KEY,
  supabase: process.env.SUPABASE_URL,
}

afterEach(() => {
  process.env.VERCEL_ENV = original.vercel
  process.env.STRIPE_SECRET_KEY = original.stripe
  process.env.SUPABASE_URL = original.supabase
})

function request(method = 'GET') {
  const response = {
    code: 0,
    body: {} as Record<string, unknown>,
    setHeader: () => undefined,
    status(code: number) { this.code = code; return this },
    json(body: Record<string, unknown>) { this.body = body; return this },
  }
  handler({ method } as VercelRequest, response as unknown as VercelResponse)
  return response
}

describe('preview readiness probe', () => {
  it('returns only safe mode and project identity in preview', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.STRIPE_SECRET_KEY = 'sk_test_never-return-this-value'
    process.env.SUPABASE_URL = 'https://stagingfixture.supabase.co'
    const response = request()
    expect(response.code).toBe(200)
    expect(response.body).toEqual({
      environment: 'preview',
      stripeMode: 'test',
      supabaseProjectRef: 'stagingfixture',
      safeForStripeOnboardingTest: true,
    })
    expect(JSON.stringify(response.body)).not.toContain('never-return-this-value')
    expect(JSON.stringify(response.body)).not.toContain('sk_test_')
  })

  it('fails closed for live or unknown keys', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.SUPABASE_URL = 'https://stagingfixture.supabase.co'
    process.env.STRIPE_SECRET_KEY = 'sk_live_fixture'
    expect(request()).toMatchObject({ code: 503, body: { stripeMode: 'live', safeForStripeOnboardingTest: false } })
    process.env.STRIPE_SECRET_KEY = '[SENSITIVE]'
    expect(request()).toMatchObject({ code: 503, body: { stripeMode: 'unknown', safeForStripeOnboardingTest: false } })
  })

  it('is unavailable in production and rejects writes', () => {
    process.env.VERCEL_ENV = 'production'
    expect(request()).toMatchObject({ code: 404 })
    process.env.VERCEL_ENV = 'preview'
    expect(request('POST')).toMatchObject({ code: 405 })
  })
})
