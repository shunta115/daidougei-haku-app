import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const endpoint = readFileSync('api/notifications/push.ts', 'utf8')
const worker = readFileSync('public/sw.js', 'utf8')
const api = readFileSync('src/platform/lib/api.ts', 'utf8')

describe('appearance push safety', () => {
  it('requires an authenticated owner and a disabled-by-default production flag', () => {
    expect(endpoint).toContain('requireAuthUser')
    expect(endpoint).toMatch(/event\.performer_id !== user\.id/)
    expect(endpoint).toContain("ENABLE_APPEARANCE_WEB_PUSH !== 'true'")
  })

  it('uses VAPID server secrets without exposing the private key to the client', () => {
    expect(endpoint).toContain('WEB_PUSH_VAPID_PRIVATE_KEY')
    expect(api).toContain('VITE_WEB_PUSH_PUBLIC_KEY')
    expect(api).not.toContain('WEB_PUSH_VAPID_PRIVATE_KEY')
  })

  it('handles expired subscriptions and bounded retries', () => {
    expect(endpoint).toMatch(/statusCode === 404 \|\| statusCode === 410/)
    expect(endpoint).toMatch(/delivery\.attempts >= 4/)
    expect(endpoint).toContain("eq('status', 'processing')")
  })

  it('keeps appearance saves independent from Push delivery failures and hides past appearances', () => {
    expect(api).toContain("await fetch('/api/notifications/push'")
    expect(api).toContain('.catch(() => undefined)')
    expect(api).toContain(".gte('starts_at', new Date().toISOString())")
  })

  it('opens only same-origin paths from notification clicks', () => {
    expect(worker).toMatch(/payload\.url\.startsWith\('\/'\)/)
    expect(worker).toContain("!payload.url.startsWith('//')")
    expect(worker).toContain('candidate.origin === self.location.origin')
    expect(worker).toContain("new URL(path, self.location.origin)")
    expect(worker).toContain("notificationclick")
  })
})
