import { afterEach, describe, expect, it } from 'vitest'
import { previewReadiness } from '../api/stripe/_previewReadiness'

const original = {
  supabase: process.env.SUPABASE_URL,
}

afterEach(() => {
  process.env.SUPABASE_URL = original.supabase
})

describe('preview readiness probe', () => {
  it('returns only safe mode and project identity in preview', () => {
    process.env.SUPABASE_URL = 'https://stagingfixture.supabase.co'
    const response = previewReadiness('test')
    expect(response).toEqual({
      environment: 'preview',
      stripeMode: 'test',
      supabaseProjectRef: 'stagingfixture',
      safeForStripeOnboardingTest: true,
    })
    expect(JSON.stringify(response)).not.toContain('sk_test_')
  })

  it('fails closed for live or unknown keys', () => {
    process.env.SUPABASE_URL = 'https://stagingfixture.supabase.co'
    expect(previewReadiness('live')).toMatchObject({ stripeMode: 'live', safeForStripeOnboardingTest: false })
    expect(previewReadiness('unknown')).toMatchObject({ stripeMode: 'unknown', safeForStripeOnboardingTest: false })
  })

  it('fails closed when the Supabase URL is absent or invalid', () => {
    process.env.SUPABASE_URL = 'not-a-url'
    expect(previewReadiness('test')).toMatchObject({ supabaseProjectRef: 'unknown', safeForStripeOnboardingTest: false })
  })
})
