import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const endpoint = readFileSync('api/notifications/push.ts', 'utf8')
const reminders = readFileSync('server/notifications/reminders.ts', 'utf8')
const worker = readFileSync('public/sw.js', 'utf8')
const api = readFileSync('src/platform/lib/api.ts', 'utf8')
const profile = readFileSync('src/platform/screens/PerformerPublicScreen.tsx', 'utf8')

describe('appearance push safety', () => {
  it('requires an authenticated owner and a disabled-by-default production flag', () => {
    expect(endpoint).toContain('requireAuthUser')
    expect(endpoint).toMatch(/event\.performer_id !== user\.id/)
    expect(reminders).toContain("ENABLE_NOTIFICATION_REMINDER_PUSH !== 'true'")
  })

  it('uses VAPID server secrets without exposing the private key to the client', () => {
    expect(reminders).toContain('WEB_PUSH_VAPID_PRIVATE_KEY')
    expect(api).toContain('VITE_WEB_PUSH_PUBLIC_KEY')
    expect(api).not.toContain('WEB_PUSH_VAPID_PRIVATE_KEY')
  })

  it('retires the legacy retry transport and preserves expired-subscription handling', () => {
    expect(endpoint).not.toContain('sendNotification')
    expect(reminders).toContain('status===404||status===410')
    expect(reminders).toContain("status:status?'failed':'unknown'")
    expect(reminders).toContain('retry:false')
  })

  it('keeps appearance saves independent from Push delivery failures and separates public past appearances', () => {
    expect(api).toContain("await fetch('/api/notifications/push'")
    expect(api).toContain('.catch(() => undefined)')
    expect(api).toContain('published_at.not.is.null')
    expect(profile).toContain('upcomingAppearances')
    expect(profile).toContain('pastAppearances')
    expect(profile).toContain("history: '過去の出演'")
  })

  it('opens only same-origin paths from notification clicks', () => {
    expect(worker).toMatch(/payload\.url\.startsWith\('\/'\)/)
    expect(worker).toContain("!payload.url.startsWith('//')")
    expect(worker).toContain('candidate.origin === self.location.origin')
    expect(worker).toContain("new URL(path, self.location.origin)")
    expect(worker).toContain("notificationclick")
  })
})
