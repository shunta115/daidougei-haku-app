// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
const fake = vi.hoisted(() => ({ slots: vi.fn(), appearances: vi.fn(), featured: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({
  liveReservationsEnabled: false,
  getFeaturedEvent: fake.featured,
  listEventSlots: fake.slots,
  listApprovedPerformers: async () => [{ id: 'p', stage_name: 'テスト出演者', is_live: true }],
  listApprovedPerformersByIds: async () => [{ id: 'p', stage_name: 'テスト出演者', is_live: true }],
  listEventVenues: async () => [],
  listLiveRanking: async () => [],
  listLivePerformers: async () => [],
  listEventLiveSessions: async () => [],
  getSignedInUserId: async () => null,
  listFollowedPerformers: async () => [],
  listUpcomingPublishedAppearances: fake.appearances,
  listUpcomingLiveSchedules: async () => [],
  listOwnLiveReservationIds: async () => [],
  reserveLiveSchedule: async () => undefined,
  cancelLiveReservation: async () => undefined,
  subscribePerformerMapUpdates: () => () => {},
}))
vi.mock('../src/platform/components/GoogleVenueMap', () => ({ GoogleVenueMap: ({ appearanceMarkers = [] }: { appearanceMarkers?: { appearance: { id: string } }[] }) => <div data-testid="appearance-markers">{appearanceMarkers.map((row) => row.appearance.id).join(',')}</div> }))
import { LangProvider } from '../src/i18n/LangProvider'
import { MapScheduleScreen } from '../src/platform/screens/MapScheduleScreen'
import { LiveListScreen } from '../src/platform/screens/LiveListScreen'
const slot = { id: 's', performer_id: 'p', date: '2099-10-10', start_time: '12:00:00', end_time: '12:30:00', status: 'scheduled', is_stream: true, note_ja: '', note_en: '' }
beforeEach(() => {
  const storage = new JSDOM('', { url: 'http://localhost' }).window.localStorage
  vi.stubGlobal('localStorage', storage)
  fake.slots.mockResolvedValue([slot])
  fake.featured.mockResolvedValue({ id: 'e', name_ja: 'AWP' })
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  fake.appearances.mockResolvedValue([{
    id: 'a', performer_id: 'p', title: '公開ステージ', performance_date: today,
    start_time: '18:00:00', starts_at: new Date(Date.now() + 60_000).toISOString(),
    venue_name: '公開会場', venue_address: '東京都渋谷区', region: '東京', country: '日本', timezone: 'Asia/Tokyo', status: 'published',
  }])
})
it('keeps public appearances visible when MAP data fails', async () => {
  fake.featured.mockRejectedValue(new Error('venue unavailable'))
  render(<LangProvider><MapScheduleScreen initialView="schedule" onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} /></LangProvider>)
  expect(await screen.findByText('公開ステージ')).toBeTruthy()
  expect(screen.queryByText('出演予定を読み込めませんでした')).toBeNull()
  expect(screen.queryByText('会場情報を読み込めませんでした')).toBeNull()
})
it('shows a login guide for the following mode when signed out', async () => {
  render(<LangProvider><MapScheduleScreen initialView="schedule" onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onRequireAuth={vi.fn()} /></LangProvider>)
  await screen.findByText('公開ステージ')
  fireEvent.click(screen.getByRole('tab', { name: /フォロー中/ }))
  expect(screen.getByText('ログインするとフォロー中の予定を確認できます')).toBeTruthy()
  expect(screen.getByRole('button', { name: /ログイン/ })).toBeTruthy()
})
it('syncs the schedule and MAP views to direct URLs and popstate navigation', async () => {
  window.history.replaceState({}, '', '/event')
  render(<LangProvider><MapScheduleScreen initialView="schedule" onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} /></LangProvider>)
  await screen.findByText('公開ステージ')
  expect(screen.getByRole('tablist', { name: '表示対象' })).toBeTruthy()

  window.history.pushState({}, '', '/map')
  window.dispatchEvent(new PopStateEvent('popstate'))
  expect(await screen.findByRole('group', { name: /MAPの絞り込み|Map filters/i })).toBeTruthy()
  expect(screen.queryByRole('tablist', { name: '表示対象' })).toBeNull()

  window.history.pushState({}, '', '/event')
  window.dispatchEvent(new PopStateEvent('popstate'))
  expect(await screen.findByRole('tablist', { name: '表示対象' })).toBeTruthy()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('refreshes cancellation and time changes on focus without remounting the MAP', async () => {
  const rows = await fake.appearances()
  const published = { ...rows[0], venue_lat: 35.7, venue_lng: 139.7, ends_at: new Date(Date.now() + 3600000).toISOString(), published_at: new Date().toISOString() }
  fake.appearances.mockResolvedValue([published])
  render(<LangProvider><MapScheduleScreen initialView="map" onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} /></LangProvider>)
  await screen.findByText('近くの大道芸を探す')
  const markers = screen.getByTestId('appearance-markers')
  await vi.waitFor(() => expect(markers.textContent).toBe('a'))
  fake.appearances.mockResolvedValue([{ ...published, status: 'cancelled' }])
  window.dispatchEvent(new Event('focus'))
  await vi.waitFor(() => expect(markers.textContent).toBe(''))
  fake.appearances.mockResolvedValue([{ ...published, start_time: '19:00:00' }])
  window.dispatchEvent(new Event('focus'))
  await vi.waitFor(() => expect(markers.textContent).toBe('a'))
  expect(await screen.findByText(/19:00/)).toBeTruthy()
})

it('retains publicly announced cancellations in the schedule with a status label', async () => {
  const rows = await fake.appearances()
  fake.appearances.mockResolvedValue([{ ...rows[0], status: 'cancelled', published_at: new Date().toISOString() }])
  render(<LangProvider><MapScheduleScreen initialView="schedule" onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} /></LangProvider>)
  expect(await screen.findByText('公開ステージ')).toBeTruthy()
  expect(screen.getByText('中止')).toBeTruthy()
})
it('shows public profile appearances and keeps AWP slots out of the normal schedule', async () => {
  const profile = vi.fn()
  render(<LangProvider><MapScheduleScreen initialView="schedule" onOpenPerformer={profile} onWatchLive={vi.fn()} /></LangProvider>)
  await screen.findByText('公開ステージ')
  expect(screen.queryByRole('tablist', { name: /MAP.*スケジュール/i })).toBeNull()
  expect(screen.getByText('公開会場 · 東京')).toBeTruthy()
  expect(screen.queryByText('AWP')).toBeNull()
  expect(document.querySelector('.pl-schedule-row')).toBeNull()
  expect(screen.getByRole('link', { name: 'MAPで見る' }).getAttribute('href')).toContain('google.com/maps/search')
  fireEvent.click(screen.getByRole('button', { name: 'テスト出演者のプロフィールを開く' }))
  expect(profile).toHaveBeenCalledWith('p')
})
it('excludes cancelled LIVE plans on initial load and after refresh', async () => {
  fake.slots.mockResolvedValue([{ ...slot, status: 'cancelled' }])
  const mount = () => render(<LangProvider><LiveListScreen onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} /></LangProvider>)
  mount()
  await screen.findByText('テスト出演者')
  expect(screen.queryByText(/2099-10-10/)).toBeNull()
  fake.slots.mockResolvedValue([slot])
  cleanup()
  mount()
  await screen.findAllByText('テスト出演者')
  expect(screen.getByText(/2099-10-10/)).toBeTruthy()
  fake.slots.mockResolvedValue([{ ...slot, status: 'cancelled' }])
  cleanup()
  mount()
  await screen.findAllByText('テスト出演者')
  expect(screen.queryByText(/2099-10-10/)).toBeNull()
})

