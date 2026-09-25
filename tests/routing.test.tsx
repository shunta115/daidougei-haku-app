// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { JSDOM } from 'jsdom'

const fake = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))
vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => fake.auth }))
vi.mock('../src/platform/lib/supabase', () => ({ supabase: null, requireSupabase: vi.fn(), supabaseAuthHeaders: async () => ({}) }))
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn(), useTrackView: vi.fn() }))
vi.mock('../src/platform/screens/AuthScreen', () => ({ AuthScreen: ({ initialRole }: { initialRole: string }) => <p>register:{initialRole}</p> }))
vi.mock('../src/platform/screens/PerformerHomeScreen', () => ({ PerformerHomeScreen: () => <p>performer-dashboard</p> }))
vi.mock('../src/platform/screens/FanHomeScreen', () => ({ FanHomeScreen: () => <p>fan-home</p> }))
vi.mock('../src/platform/screens/MapScheduleScreen', () => ({ MapScheduleScreen: () => <p>master-event</p> }))
vi.mock('../src/platform/screens/EventScreens', () => ({
  EventListScreen: ({ onOpen }: { onOpen: (slug: string) => void }) => <button onClick={() => onOpen('award-winning-performers-2026')}>event-list</button>,
  EventDetailScreen: ({ slug }: { slug: string }) => <p>event-detail:{slug}</p>,
}))
vi.mock('../src/platform/screens/AdminScreens', () => ({ AdminDashboardScreen: () => <p>admin-dashboard</p>, AdminUsersScreen: () => null, AdminEventScreen: () => null }))
vi.mock('../src/platform/screens/LiveWatchScreen', () => ({ LiveWatchScreen: () => <p>live-watch</p> }))
import { PlatformApp } from '../src/platform/PlatformApp'
import { EVENTS_PATH, FESTIVAL_PATH, eventPath, isPlatformPath } from '../src/app/routes'

beforeEach(() => {
  const storage = new JSDOM('', { url: 'http://localhost' }).window
  vi.stubGlobal('localStorage', storage.localStorage)
  vi.stubGlobal('sessionStorage', storage.sessionStorage)
  vi.stubGlobal('scrollTo', vi.fn())
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage.sessionStorage })
  fake.auth = { ready: true, configured: true, user: null, profile: null, profileError: null, refreshProfile: vi.fn(), signOut: vi.fn() }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps the public root, event and live routes inside the MASTER experience', () => {
  expect(isPlatformPath('/')).toBe(true)
  expect(isPlatformPath('/live')).toBe(true)
  expect(isPlatformPath('/live/register')).toBe(true)
  expect(FESTIVAL_PATH).toBe('/event')
  expect(isPlatformPath(FESTIVAL_PATH)).toBe(true)
  expect(EVENTS_PATH).toBe('/events')
  expect(isPlatformPath(EVENTS_PATH)).toBe(true)
  expect(isPlatformPath(eventPath('award-winning-performers-2026'))).toBe(true)
})

it('opens a QR event URL directly without requiring authentication', async () => {
  window.history.replaceState({}, '', eventPath('award-winning-performers-2026'))
  render(<PlatformApp />)
  await screen.findByText('event-detail:award-winning-performers-2026')
})

it('opens the generic event list and routes to the selected event', async () => {
  window.history.replaceState({}, '', EVENTS_PATH)
  render(<PlatformApp />)
  screen.getByRole('button', { name: 'event-list' }).click()
  await screen.findByText('event-detail:award-winning-performers-2026')
  expect(window.location.pathname).toBe(eventPath('award-winning-performers-2026'))
})

it('keeps event UI in sync with Safari back navigation', async () => {
  window.history.replaceState({}, '', eventPath('award-winning-performers-2026'))
  render(<PlatformApp />)
  await screen.findByText('event-detail:award-winning-performers-2026')
  window.history.pushState({}, '', EVENTS_PATH)
  window.dispatchEvent(new PopStateEvent('popstate'))
  await screen.findByRole('button', { name: 'event-list' })
})

it('opens the event in MASTER UI and can return through the shared bottom navigation', async () => {
  window.history.replaceState({}, '', FESTIVAL_PATH)
  render(<PlatformApp />)
  await screen.findByText('master-event')
  screen.getByRole('button', { name: 'ホーム' }).click()
  await screen.findByText('fan-home')
})

it('keeps the performer role on a cold load while the original query is cleaned', async () => {
  window.history.replaceState({}, '', '/live?auth=1&role=performer')
  render(<PlatformApp />)
  await screen.findByText('register:performer')
})

it('opens the dedicated registration entry as performer', async () => {
  window.history.replaceState({}, '', '/live/register')
  render(<PlatformApp />)
  await screen.findByText('register:performer')
})

it('resumes the performer dashboard after relogin rather than fan home', async () => {
  window.history.replaceState({}, '', '/live')
  fake.auth.user = { id: 'fixture' }
  fake.auth.profile = { role: 'performer', status: 'pending' }
  render(<PlatformApp />)
  await screen.findByText('performer-dashboard')
})

it('prioritizes registration over an old live viewing intent', async () => {
  window.history.replaceState({}, '', '/live/register')
  window.sessionStorage.setItem('pl-watch', 'old-viewing-intent')
  fake.auth.user = { id: 'fixture' }
  fake.auth.profile = { role: 'performer', status: 'pending' }
  render(<PlatformApp />)
  await screen.findByText('performer-dashboard')
  expect(screen.queryByText('live-watch')).toBeNull()
})

it('does not silently convert an existing fan into a performer', async () => {
  window.history.replaceState({}, '', '/live/register')
  fake.auth.user = { id: 'fixture' }
  fake.auth.profile = { role: 'fan', status: 'active' }
  render(<PlatformApp />)
  await screen.findByText(/現在はファンのアカウント/)
})

it('returns from Stripe to the performer dashboard', async () => {
  window.history.replaceState({}, '', '/live?stripe=return')
  fake.auth.user = { id: 'fixture' }
  fake.auth.profile = { role: 'performer', status: 'pending' }
  render(<PlatformApp />)
  await screen.findByText('performer-dashboard')
})
