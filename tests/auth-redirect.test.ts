import { describe, expect, it } from 'vitest'
import { resolveAuthRedirectOrigin, sanitizedAuthCallbackUrl } from '../src/platform/lib/authRedirect'

describe('durable Supabase auth redirects', () => {
  it('prefers the configured stable preview origin over an expiring deployment URL', () => {
    expect(resolveAuthRedirectOrigin(
      'https://app-random-deployment.vercel.app',
      'https://app-git-feature-team.vercel.app',
    )).toBe('https://app-git-feature-team.vercel.app')
  })

  it('rejects unsafe configured redirects and keeps the current origin', () => {
    expect(resolveAuthRedirectOrigin('https://safe.example.com', 'javascript:alert(1)')).toBe('https://safe.example.com')
    expect(resolveAuthRedirectOrigin('https://safe.example.com', 'https://evil.example.com/path')).toBe('https://safe.example.com')
    expect(resolveAuthRedirectOrigin('https://safe.example.com', 'https://user:pass@evil.example.com')).toBe('https://safe.example.com')
  })

  it('removes callback secrets while preserving unrelated navigation state', () => {
    expect(sanitizedAuthCallbackUrl({
      pathname: '/live',
      search: '?stripe=return&code=one-time-code',
      hash: '#access_token=secret&refresh_token=secret-too&type=signup',
    })).toBe('/live?stripe=return')
  })

  it('does not rewrite ordinary URLs', () => {
    expect(sanitizedAuthCallbackUrl({ pathname: '/live', search: '?stripe=return', hash: '#profile' })).toBeNull()
  })
})
