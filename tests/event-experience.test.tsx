// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JSDOM } from 'jsdom'

const fake = vi.hoisted(() => ({
  auth: { user: null, profile: null } as Record<string, unknown>,
  listPublishedEvents: vi.fn(),
  getEventBySlug: vi.fn(),
  getEventVoteRule: vi.fn(),
  getMyVotes: vi.fn(),
  listEventLineupPerformers: vi.fn(),
  listEventSlots: vi.fn(),
  listEventVenues: vi.fn(),
  listVoteRankingNamed: vi.fn(),
  voteForPerformer: vi.fn(),
}))

vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => fake.auth }))
vi.mock('../src/platform/lib/api', () => ({
  getEventBySlug: fake.getEventBySlug,
  getEventVoteRule: fake.getEventVoteRule,
  getMyVotes: fake.getMyVotes,
  listEventLineupPerformers: fake.listEventLineupPerformers,
  listEventSlots: fake.listEventSlots,
  listEventVenues: fake.listEventVenues,
  listPublishedEvents: fake.listPublishedEvents,
  listVoteRankingNamed: fake.listVoteRankingNamed,
  voteForPerformer: fake.voteForPerformer,
}))

import { EventDetailScreen, EventListScreen } from '../src/platform/screens/EventScreens'

const event = {
  id: 'event-1',
  slug: 'award-winning-performers-2026',
  name_ja: '受賞者たち',
  name_en: 'Award-winning Performers',
  presenter_ja: 'Presented by 大道芸博 2026',
  presenter_en: 'Presented by Daidogeihaku 2026',
  date_label: '2026.10.10 / 11 / 12',
  place_label: '東京・練馬城址公園',
  hours_label: '10:00〜19:00',
  official_url: '',
  weather_note_ja: '',
  starts_on: '2026-10-10',
  ends_on: '2026-10-12',
  status: 'published' as const,
  hero_kicker_ja: '国内外で受賞歴のある大道芸人が集結！',
  main_copy_ja: '観る。選ぶ。もう一度、沸く。',
  sub_copy_ja: 'あなたの一票で、夜のステージが決まる。',
  admission_label: '入場無料',
  guide_enabled: true,
  results_published_at: null,
}

const performer = {
  id: 'performer-1', stage_name: 'SUI', bio: '', genre: 'ジャグリング', country: '日本', city: '東京',
  photo_url: null, support_blurb: '', stripe_account_id: null, stripe_onboarding_complete: false,
  is_approved: true, is_live: false, live_started_at: null, live_title: null, stream_url: null,
  share_location: false, lat: null, lng: null, location_updated_at: null, awards: '国際大会優勝',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  const storage = new JSDOM('', { url: 'http://localhost' }).window
  vi.stubGlobal('localStorage', storage.localStorage)
  vi.stubGlobal('sessionStorage', storage.sessionStorage)
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage.localStorage })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage.sessionStorage })
  fake.auth = { user: null, profile: null }
  fake.listPublishedEvents.mockResolvedValue([event])
  fake.getEventBySlug.mockResolvedValue(event)
  fake.getEventVoteRule.mockResolvedValue({ event_id: event.id, voting_open: true, votes_per_user_per_day: 1, voting_starts_at: null, voting_ends_at: null, updated_at: '' })
  fake.getMyVotes.mockResolvedValue([])
  fake.listEventLineupPerformers.mockResolvedValue([performer])
  fake.listEventSlots.mockResolvedValue([])
  fake.listEventVenues.mockResolvedValue([])
  fake.listVoteRankingNamed.mockResolvedValue([{ performer: { ...performer, id: 'hidden-rank', stage_name: '途中順位' }, votes: 99 }])
  fake.voteForPerformer.mockResolvedValue(undefined)
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('lists published events from the database and opens the selected slug', async () => {
  const open = vi.fn()
  render(<EventListScreen onOpen={open} />)
  await screen.findByText('受賞者たち')
  fireEvent.click(screen.getByRole('button', { name: /イベントを楽しむ/ }))
  expect(open).toHaveBeenCalledWith(event.slug)
})

it('allows anonymous event viewing while hiding unpublished intermediate results', async () => {
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={vi.fn()} />)
  await screen.findAllByText('受賞者たち')
  expect(screen.getByText('観る。選ぶ。もう一度、沸く。')).toBeTruthy()
  expect(screen.getByText(/途中順位は公開しません/)).toBeTruthy()
  expect(screen.queryByText('途中順位')).toBeNull()
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('asks an anonymous visitor to authenticate only when voting', async () => {
  const requireAuth = vi.fn()
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={requireAuth} />)
  await screen.findAllByText('SUI')
  fireEvent.click(screen.getAllByRole('button', { name: '投票する' }).at(-1)!)
  expect(requireAuth).toHaveBeenCalledOnce()
  expect(sessionStorage.getItem('pl-event-return')).toBe(event.slug)
  expect(fake.voteForPerformer).not.toHaveBeenCalled()
})

it('casts an authenticated fan vote through the server API and shows completion feedback', async () => {
  fake.auth = { user: { id: 'fan-1' }, profile: { role: 'fan', status: 'active' } }
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={vi.fn()} />)
  await screen.findAllByText('SUI')
  fireEvent.click(screen.getAllByRole('button', { name: '投票する' }).at(-1)!)
  await waitFor(() => expect(fake.voteForPerformer).toHaveBeenCalledWith(event.id, performer.id, 'fan-1'))
  expect(await screen.findByText('投票完了！')).toBeTruthy()
})
