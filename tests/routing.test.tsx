// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JSDOM } from 'jsdom'

const fake = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))
vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => fake.auth }))
vi.mock('../src/platform/lib/supabase', () => ({ supabase: null, requireSupabase: vi.fn(), supabaseAuthHeaders: async () => ({}) }))
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn(), useTrackView: vi.fn() }))
vi.mock('../src/platform/screens/AuthScreen', () => ({ AuthScreen: ({ initialRole }: { initialRole: string }) => <p>register:{initialRole}</p> }))
vi.mock('../src/platform/screens/PerformerHomeScreen', () => ({ PerformerHomeScreen: () => <p>performer-dashboard</p> }))
vi.mock('../src/platform/screens/FanHomeScreen', () => ({ FanHomeScreen: ({ onOpenPerformer, onOpenTitle }: { onOpenPerformer: (id: string) => void; onOpenTitle?: () => void }) => <><p>fan-home</p><button onClick={() => onOpenPerformer('performer-1')}>home-performer</button><button onClick={onOpenTitle}>home-title</button></> }))
vi.mock('../src/platform/screens/MapScheduleScreen', () => ({ MapScheduleScreen: ({ onOpenPerformer }: { onOpenPerformer: (id: string) => void }) => <><p>master-event</p><button onClick={() => onOpenPerformer('performer-1')}>map-performer</button></> }))
vi.mock('../src/platform/screens/EventScreens', () => ({
  EventListScreen: ({ onOpen }: { onOpen: (slug: string) => void }) => <button onClick={() => onOpen('award-winning-performers-2026')}>event-list</button>,
  EventDetailScreen: ({ slug, onBack, onOpenPerformer }: { slug: string; onBack: () => void; onOpenPerformer: (id: string) => void }) => <><p>event-detail:{slug}</p><button onClick={onBack}>event-back</button><button onClick={() => onOpenPerformer('performer-1')}>event-performer</button></>,
}))
vi.mock('../src/platform/screens/PerformerPublicScreen', () => ({ PerformerPublicScreen: ({ onBack }: { onBack: () => void }) => <><p>performer-public</p><button onClick={onBack}>profile-back</button></> }))
vi.mock('../src/platform/screens/LiveListScreen', () => ({ LiveListScreen: ({ onOpenPerformer }: { onOpenPerformer: (id: string) => void }) => <><p>live-list</p><button onClick={() => onOpenPerformer('performer-1')}>live-performer</button></> }))
vi.mock('../src/platform/screens/MerchScreens', () => ({
  MerchListScreen: ({ onOpenProduct }: { onOpenProduct: (id: string) => void }) => <><p>merch-list</p><button onClick={() => onOpenProduct('product-1')}>open-product</button></>,
  MerchDetailScreen: ({ onBack, productId }: { onBack: () => void; productId: string }) => <><p>merch-detail</p><p>product:{productId}</p><button onClick={onBack}>product-back</button></>,
  PerformerMerchScreen: () => null,
}))
vi.mock('../src/platform/screens/AdminScreens', () => ({ AdminDashboardScreen: () => <p>admin-dashboard</p>, AdminUsersScreen: () => null, AdminEventScreen: () => null }))
vi.mock('../src/platform/screens/LiveWatchScreen', () => ({ LiveWatchScreen: () => <p>live-watch</p> }))
import { PlatformApp } from '../src/platform/PlatformApp'
import { EVENTS_PATH, FESTIVAL_PATH, eventPath, isPlatformPath, spaGo } from '../src/app/routes'

it('recognizes the public MAP permalink', () => {
  expect(isPlatformPath('/map')).toBe(true)
})

beforeEach(() => {
  const storage = new JSDOM('', { url: 'http://localhost' }).window
  vi.stubGlobal('localStorage', storage.localStorage)
  vi.stubGlobal('sessionStorage', storage.sessionStorage)
  vi.stubGlobal('scrollTo', vi.fn())
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage.sessionStorage })
  window.localStorage.setItem('pl-master-splash-seen-v3', '1')
  window.localStorage.setItem('daidougei-lang', 'ja')
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

it('bypasses the title screen for a Supabase password recovery callback', async () => {
  window.localStorage.removeItem('pl-master-splash-seen-v3')
  window.history.replaceState({}, '', '/#access_token=fixture&type=recovery')
  fake.auth = { ...fake.auth, passwordRecovery: true }
  render(<PlatformApp />)
  await screen.findByText('register:fan')
  expect(screen.queryByRole('button', { name: '音声をオンにする' })).toBeNull()
})

it('keeps the Supabase recovery token hash while routing to the password screen', async () => {
  window.history.replaceState({}, '', '/live?auth=recovery#access_token=fixture&type=recovery')
  fake.auth = { ...fake.auth, passwordRecovery: true }
  render(<PlatformApp />)
  await screen.findByText('register:fan')
  expect(window.location.hash).toBe('#access_token=fixture&type=recovery')
})

it('keeps the password screen on the dedicated recovery route after Supabase cleans all callback parameters', async () => {
  window.history.replaceState({}, '', '/auth/reset-password')
  fake.auth = { ...fake.auth, passwordRecovery: true }
  render(<PlatformApp />)
  await screen.findByText('register:fan')
  expect(window.location.pathname).toBe('/auth/reset-password')
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

it('returns from a performer profile to the exact event context', async () => {
  window.history.replaceState({}, '', EVENTS_PATH)
  render(<PlatformApp />)
  fireEvent.click(screen.getByRole('button', { name: 'event-list' }))
  await screen.findByText('event-detail:award-winning-performers-2026')
  fireEvent.click(screen.getByRole('button', { name: 'event-performer' }))
  await screen.findByText('performer-public')
  fireEvent.click(screen.getByRole('button', { name: 'profile-back' }))
  await screen.findByText('event-detail:award-winning-performers-2026')
})

it('returns from a performer profile to HOME', async () => {
  window.history.replaceState({}, '', '/')
  render(<PlatformApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'home-performer' }))
  fireEvent.click(await screen.findByRole('button', { name: 'profile-back' }))
  await screen.findByText('fan-home')
})

it('returns a signed-out visitor from HOME to the title screen', async () => {
  window.history.replaceState({}, '', '/')
  render(<PlatformApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'home-title' }))
  expect(await screen.findByText('世界が舞台。')).toBeTruthy()
})

it('returns from a performer profile to map and live list contexts', async () => {
  window.history.replaceState({}, '', FESTIVAL_PATH)
  const view = render(<PlatformApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'map-performer' }))
  fireEvent.click(await screen.findByRole('button', { name: 'profile-back' }))
  await screen.findByText('master-event')
  view.unmount()

  window.history.replaceState({}, '', '/live?live=1')
  render(<PlatformApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'live-performer' }))
  fireEvent.click(await screen.findByRole('button', { name: 'profile-back' }))
  await screen.findByText('live-list')
})

it('returns from goods detail to the goods list', async () => {
  window.history.replaceState({}, '', '/live?merch=1')
  render(<PlatformApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'open-product' }))
  await screen.findByText('merch-detail')
  fireEvent.click(screen.getByRole('button', { name: 'product-back' }))
  await screen.findByText('merch-list')
})

it('uses a safe fallback for a directly opened performer profile', async () => {
  window.history.replaceState({}, '', '/performer/performer-1')
  render(<PlatformApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'profile-back' }))
  expect(window.location.pathname).toBe('/')
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

it('resumes the shared home after performer relogin', async () => {
  window.history.replaceState({}, '', '/live')
  fake.auth.user = { id: 'fixture' }
  fake.auth.profile = { role: 'performer', status: 'pending' }
  fake.auth.performer = { id: 'fixture', stage_name: 'fixture' }
  render(<PlatformApp />)
  await screen.findByText('fan-home')
})

it('prioritizes registration over an old live viewing intent', async () => {
  window.history.replaceState({}, '', '/live/register')
  window.sessionStorage.setItem('pl-watch', 'old-viewing-intent')
  fake.auth.user = { id: 'fixture' }
  fake.auth.profile = { role: 'performer', status: 'pending' }
  fake.auth.performer = { id: 'fixture', stage_name: 'fixture' }
  render(<PlatformApp />)
  await screen.findByText('fan-home')
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

const merchandiseEntries = [
  { query: '?merch=1', expected: 'merch-list' },
  { query: '?merchProduct=product-2', expected: 'product:product-2' },
]
const merchandiseRoles = [null, 'fan', 'performer', 'organizer', 'admin'] as const
for (const role of merchandiseRoles) {
  for (const entry of merchandiseEntries) {
    for (const saved of [false, true]) {
      it(`opens ${entry.query} for ${role ?? 'guest'} with saved=${saved}, including reload`, async () => {
        if (role) {
          fake.auth.user = { id: 'fixture' }
          fake.auth.profile = { role, status: 'active' }
        }
        window.history.replaceState(saved ? { hakuSnapshot: { screen: 'fan-home', performerId: null, merchProductId: null, eventSlug: null } } : {}, '', '/live' + entry.query)
        const view = render(<PlatformApp />)
        await screen.findByText(entry.expected)
        view.unmount()
        render(<PlatformApp />)
        await screen.findByText(entry.expected)
      })
    }
    it(`opens ${entry.query} during an existing ${role ?? 'guest'} session`, async () => {
      if (role) {
        fake.auth.user = { id: 'fixture' }
        fake.auth.profile = { role, status: 'active' }
      }
      window.history.replaceState({}, '', '/')
      render(<PlatformApp />)
      act(() => spaGo('/live' + entry.query))
      await screen.findByText(entry.expected)
    })
  }
}

for (const entry of merchandiseEntries) {
  it(`preserves ${entry.query} while authentication finishes`, async () => {
    window.history.replaceState({ hakuSnapshot: { screen: 'fan-home', performerId: null, merchProductId: null, eventSlug: null } }, '', '/live' + entry.query)
    fake.auth = { ...fake.auth, ready: false }
    const view = render(<PlatformApp />)
    fake.auth = { ...fake.auth, ready: true, user: { id: 'fixture' }, profile: { role: 'fan', status: 'active' } }
    view.rerender(<PlatformApp />)
    await screen.findByText(entry.expected)
  })
}

it('restores the correct merchandise product through Back and Forward', async () => {
  window.history.replaceState({}, '', '/live?merch=1')
  render(<PlatformApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'open-product' }))
  await screen.findByText('product:product-1')
  act(() => window.history.back())
  await screen.findByText('merch-list')
  act(() => window.history.forward())
  await screen.findByText('product:product-1')
})
