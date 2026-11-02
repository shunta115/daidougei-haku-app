// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { NotificationInvitation } from '../src/platform/components/NotificationInvitation'
import { announceNotificationOpportunity, claimNotificationPrompt } from '../src/platform/lib/notificationPrompt'
beforeEach(() => {
  window.localStorage.clear()
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Safari' })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('guides Safari installation without requesting OS permission, and opens settings only by click', () => {
  const open = vi.fn(); render(<NotificationInvitation userId="fan" onSettings={open} />)
  expect(screen.getByText('iPhoneではSafariからホーム画面に追加してください。')).toBeTruthy()
  expect(Notification.requestPermission).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('通知設定を確認する')); expect(open).toHaveBeenCalledOnce()
})
it.each(['denied', 'granted'])('never automatically invites %s users', permission => {
  vi.stubGlobal('Notification', { permission, requestPermission: vi.fn() })
  render(<NotificationInvitation userId="fan" onSettings={vi.fn()} />)
  announceNotificationOpportunity('fan', 'follow'); expect(screen.queryByLabelText('通知のご案内')).toBeNull()
  expect(Notification.requestPermission).not.toHaveBeenCalled()
})
it('dismissal suppresses login, follow and reservation prompts across remounts', () => {
  const view = render(<NotificationInvitation userId="fan" onSettings={vi.fn()} />)
  fireEvent.click(screen.getByText('今はしない'))
  announceNotificationOpportunity('fan', 'follow'); announceNotificationOpportunity('fan', 'reservation')
  expect(screen.queryByLabelText('通知のご案内')).toBeNull(); view.unmount()
  render(<NotificationInvitation userId="fan" onSettings={vi.fn()} />)
  expect(screen.queryByLabelText('通知のご案内')).toBeNull()
})
it('enforces shared cooldown, lifetime cap, per-account separation and fails closed on broken storage', () => {
  const day=86400000, now=Date.now()
  expect(claimNotificationPrompt('a',now)).toBe(true); expect(claimNotificationPrompt('a',now+day)).toBe(false)
  expect(claimNotificationPrompt('a',now+15*day)).toBe(true); expect(claimNotificationPrompt('a',now+30*day)).toBe(true)
  expect(claimNotificationPrompt('a',now+60*day)).toBe(false); expect(claimNotificationPrompt('b',now)).toBe(true)
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(() => {throw new Error('blocked')})
  expect(claimNotificationPrompt('c',now)).toBe(false)
})
