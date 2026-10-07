// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
const fake = vi.hoisted(() => ({ slots: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({
  getFeaturedEvent: async () => ({ id: 'e', name_ja: 'AWP' }),
  listEventSlots: fake.slots,
  listApprovedPerformers: async () => [{ id: 'p', stage_name: 'テスト出演者', is_live: true }],
  listEventVenues: async () => [],
  listLiveRanking: async () => [],
  listLivePerformers: async () => [],
  listEventLiveSessions: async () => [],
  subscribePerformerMapUpdates: () => () => {},
}))
vi.mock('../src/platform/components/GoogleVenueMap', () => ({ GoogleVenueMap: () => null }))
import { LangProvider } from '../src/i18n/LangProvider'
import { MapScheduleScreen } from '../src/platform/screens/MapScheduleScreen'
import { LiveListScreen } from '../src/platform/screens/LiveListScreen'
import { refreshVisibleData } from '../src/platform/lib/pullToRefresh'
const slot = { id: 's', performer_id: 'p', date: '2099-10-10', start_time: '12:00:00', end_time: '12:30:00', status: 'scheduled', is_stream: true, note_ja: '', note_en: '' }
beforeEach(() => {
  const storage = new JSDOM('', { url: 'http://localhost' }).window.localStorage
  vi.stubGlobal('localStorage', storage)
  fake.slots.mockResolvedValue([slot])
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })
it('shows and disables cancelled map schedule rows, refreshing same-day changes', async () => {
  const live = vi.fn(), profile = vi.fn()
  render(<LangProvider><MapScheduleScreen initialView="schedule" onOpenPerformer={profile} onWatchLive={live} /></LangProvider>)
  await screen.findAllByText('テスト出演者')
  const row = () => document.querySelector<HTMLButtonElement>('.pl-schedule-row')!
  expect(row().disabled).toBe(false)
  fireEvent.click(row())
  expect(live).toHaveBeenCalledTimes(1)
  fake.slots.mockResolvedValue([{ ...slot, status: 'cancelled', note_ja: '雨天' }])
  await act(async () => { await refreshVisibleData() })
  expect(row().disabled).toBe(true)
  expect(row().textContent).toContain('中止：雨天')
  expect(row().textContent).not.toContain('LIVE')
  fireEvent.click(row())
  expect(live).toHaveBeenCalledTimes(1)
  expect(profile).not.toHaveBeenCalled()
  fake.slots.mockResolvedValue([{ ...slot, start_time: '13:00:00' }])
  await act(async () => { await refreshVisibleData() })
  expect(row().disabled).toBe(false)
  expect(row().textContent).toContain('13:00')
})
it('excludes cancelled LIVE plans on initial load and after refresh', async () => {
  fake.slots.mockResolvedValue([{ ...slot, status: 'cancelled' }])
  render(<LangProvider><LiveListScreen onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} /></LangProvider>)
  await screen.findByText('テスト出演者')
  expect(screen.queryByText(/2099-10-10/)).toBeNull()
  fake.slots.mockResolvedValue([slot])
  await act(async () => { await refreshVisibleData() })
  expect(screen.getByText(/2099-10-10/)).toBeTruthy()
  fake.slots.mockResolvedValue([{ ...slot, status: 'cancelled' }])
  await act(async () => { await refreshVisibleData() })
  expect(screen.queryByText(/2099-10-10/)).toBeNull()
})
