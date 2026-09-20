import { describe, expect, it } from 'vitest'
import { performerRegistrationStatus, profileMissingFields, registrationError } from '../src/platform/lib/onboarding'

const complete = { stage_name: 'テスト芸名', genre: 'ジャグリング', bio: '自己紹介', city: '東京都', photo_url: 'https://example.com/photo.jpg', stripe_account_id: 'acct_fixture', stripe_onboarding_complete: true, is_approved: true }

describe('performer registration readiness', () => {
  it('guides a new performer to the profile before payouts', () => {
    expect(performerRegistrationStatus({ stage_name: '芸名' }).next).toBe('profile')
    expect(profileMissingFields({ stage_name: '芸名' })).toEqual(['ジャンル', '自己紹介', '活動地域', 'プロフィール写真'])
  })
  it('does not mistake an account id for completed onboarding', () => {
    expect(performerRegistrationStatus({ ...complete, stripe_onboarding_complete: false }).next).toBe('payouts')
    expect(performerRegistrationStatus({ ...complete, stripe_account_id: null }).next).toBe('payouts')
  })
  it('requires approval separately from completed Stripe setup', () => {
    expect(performerRegistrationStatus({ ...complete, is_approved: false }).next).toBe('approval')
    expect(performerRegistrationStatus(complete).next).toBe('complete')
  })
  it('preserves approval of existing performers even when fields are incomplete', () => {
    expect(performerRegistrationStatus({ ...complete, bio: ' ' })).toMatchObject({ next: 'profile', approved: true })
  })
  it('does not expose arbitrary provider details in errors', () => {
    expect(registrationError(new Error('internal detail: fixture-private-value'))).not.toContain('fixture-private-value')
    expect(registrationError({ message: 'Invalid login credentials' })).toContain('メールアドレスまたはパスワード')
    expect(registrationError({ message: 'Email not confirmed' })).toContain('確認メール')
  })
})
