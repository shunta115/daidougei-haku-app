// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JSDOM } from 'jsdom'

const fake = vi.hoisted(() => ({
  auth: { user: null, profile: null } as Record<string, unknown>,
  listPublishedEvents: vi.fn(),
  getEventBySlug: vi.fn(),
  getEventVoteRule: vi.fn(),
  getAnonVoteState: vi.fn(),
  castAnonEventVote: vi.fn(),
  getMyVotes: vi.fn(),
  listEventLineupPerformers: vi.fn(),
  listVotingEligibleEventLineupPerformers: vi.fn(),
  listEventSlots: vi.fn(),
  listEventVenues: vi.fn(),
  listEventGuestAppearances: vi.fn(),
  listApprovedPerformersByIds: vi.fn(),
  listVoteRankingNamed: vi.fn(),
  voteForPerformer: vi.fn(),
}))

vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => fake.auth }))
vi.mock('../src/platform/lib/api', () => ({
  getEventBySlug: fake.getEventBySlug,
  getEventVoteRule: fake.getEventVoteRule,
  getAnonVoteState: fake.getAnonVoteState,
  castAnonEventVote: fake.castAnonEventVote,
  getMyVotes: fake.getMyVotes,
  listEventLineupPerformers: fake.listEventLineupPerformers,
  listVotingEligibleEventLineupPerformers: fake.listVotingEligibleEventLineupPerformers,
  listEventSlots: fake.listEventSlots,
  listEventVenues: fake.listEventVenues,
  listEventGuestAppearances: fake.listEventGuestAppearances,
  listApprovedPerformersByIds: fake.listApprovedPerformersByIds,
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
  storage.localStorage.setItem('daidougei-lang', 'ja')
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage.sessionStorage })
  fake.auth = { user: null, profile: null }
  fake.listPublishedEvents.mockResolvedValue([event])
  fake.getEventBySlug.mockResolvedValue(event)
  fake.getEventVoteRule.mockResolvedValue({ event_id: event.id, voting_enabled: true, voting_open: true, votes_per_user_per_day: 1, voting_starts_at: null, voting_ends_at: null, updated_at: '' })
  fake.getAnonVoteState.mockResolvedValue({ voting_open: true, max_votes: 3, used: 0, remaining: 3, voted: [] })
  fake.castAnonEventVote.mockResolvedValue(undefined)
  fake.getMyVotes.mockResolvedValue([])
  fake.listEventLineupPerformers.mockResolvedValue([performer])
  fake.listVotingEligibleEventLineupPerformers.mockResolvedValue([performer])
  fake.listEventSlots.mockResolvedValue([])
  fake.listEventVenues.mockResolvedValue([])
  fake.listEventGuestAppearances.mockResolvedValue([])
  fake.listApprovedPerformersByIds.mockResolvedValue([])
  fake.listVoteRankingNamed.mockResolvedValue([{ performer: { ...performer, id: 'hidden-rank', stage_name: '途中順位' }, votes: 99 }])
  fake.voteForPerformer.mockResolvedValue(undefined)
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('scrollTo', vi.fn())
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('lists published events from the database and opens the selected slug', async () => {
  const open = vi.fn()
  render(<EventListScreen onOpen={open} />)
  await screen.findByText('受賞者たち')
  expect(screen.getByRole('img', { name: '受賞者たち Presented by 大道芸博 2026 公式チラシ' }).getAttribute('src')).toBe('/events/award-winning-performers-2026/official-flyer-2026.webp')
  expect(screen.getByRole('img', { name: 'AWP 2026 公式会場MAP・チラシ裏面' }).getAttribute('src')).toBe('/events/award-winning-performers-2026/official-venue-map.webp')
  for (const fact of ['10/10〜12', '10:00〜19:00', '東京 練馬城址公園', '入場無料', 'Presented by 大道芸博 2026']) {
    expect(screen.getByText(fact)).toBeTruthy()
  }
  fireEvent.click(screen.getByRole('button', { name: /イベントを楽しむ/ }))
  expect(open).toHaveBeenCalledWith(event.slug)
})

it('shows a readable hero and opens the official flyer without using it as the background', async () => {
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={vi.fn()} />)
  await screen.findByRole('heading', { name: '受賞者たち' })
  expect(document.querySelector('.pl-event-hero__art')).toBeNull()
  expect(screen.getByText('観る。選ぶ。もう一度、沸く。')).toBeTruthy()
  expect(screen.getAllByText('あなたの一票で、夜のステージが決まる。').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '今日のイベントを楽しむ' }))
  fireEvent.click(screen.getByRole('button', { name: '公式チラシを見る' }))
  const flyer = screen.getByRole('dialog', { name: '受賞者たち2026 公式チラシ' })
  const image = flyer.querySelector('img')
  expect(image?.getAttribute('src')).toBe('/events/award-winning-performers-2026/official-flyer-2026.webp')
  expect(image?.getAttribute('alt')).toBe('受賞者たち Presented by 大道芸博 2026 公式チラシ')
})

it('allows anonymous event viewing while hiding unpublished intermediate results', async () => {
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={vi.fn()} />)
  await screen.findAllByText('受賞者たち')
  expect(screen.getByText('観る。選ぶ。もう一度、沸く。')).toBeTruthy()
  expect(screen.queryByText('途中順位')).toBeNull()
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('allows an anonymous visitor to use the device-scoped vote API', async () => {
  const requireAuth = vi.fn()
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={requireAuth} />)
  await screen.findAllByText('SUI')
  const voteSection = document.getElementById('event-vote')
  const candidate = Array.from(voteSection?.querySelectorAll('article') ?? []).find((item) => item.textContent?.includes('SUI'))
  const voteButton = Array.from(candidate?.querySelectorAll('button') ?? []).find((button) => button.textContent?.trim() === '投票する')
  expect(voteButton).toBeTruthy()
  await waitFor(() => expect((voteButton as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(voteButton!)
  await waitFor(() => expect(fake.castAnonEventVote).toHaveBeenCalledWith(event.id, performer.id))
  expect(requireAuth).not.toHaveBeenCalled()
  expect(fake.voteForPerformer).not.toHaveBeenCalled()
})

it('casts an authenticated fan vote through the same device-scoped server API and shows completion feedback', async () => {
  fake.auth = { user: { id: 'fan-1' }, profile: { role: 'fan', status: 'active' } }
  fake.getAnonVoteState
    .mockResolvedValueOnce({ voting_open: true, max_votes: 3, used: 0, remaining: 3, voted: [] })
    .mockResolvedValueOnce({ voting_open: true, max_votes: 3, used: 0, remaining: 3, voted: [] })
    .mockResolvedValue({ voting_open: true, max_votes: 3, used: 1, remaining: 2, voted: [performer.id] })
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={vi.fn()} />)
  await screen.findAllByText('SUI')
  const voteSection = document.getElementById('event-vote')
  const candidate = Array.from(voteSection?.querySelectorAll('article') ?? []).find((item) => item.textContent?.includes('SUI'))
  const voteButton = Array.from(candidate?.querySelectorAll('button') ?? []).find((button) => button.textContent?.trim() === '投票する')
  expect(voteButton).toBeTruthy()
  await waitFor(() => expect((voteButton as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(voteButton!)
  await waitFor(() => expect(fake.castAnonEventVote).toHaveBeenCalledWith(event.id, performer.id))
  expect(await screen.findByText('SUIに投票しました！')).toBeTruthy()
})


it.each(['09:00', '10:10'])('removes cancelled slots from recommendations and saved wants, retaining disabled timetable rows through same-day changes at %s', async (time) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`2026-10-10T${time}:00+09:00`))
  const slot = { id: 'slot-1', event_id: event.id, performer_id: performer.id, performer_name_ja: '予定枠テスト', venue_id: 'v1', date: '2026-10-10', start_time: '10:00:00', end_time: '10:30:00', status: 'scheduled', note_ja: '', note_en: '', stage_ja: 'ステージ1', stage_en: '', is_stream: true }
  fake.listEventSlots.mockResolvedValue([slot])
  fake.listEventLineupPerformers.mockResolvedValue([{ ...performer, is_live: true }])
  localStorage.setItem(`haku:wanted-slots:${event.id}`, JSON.stringify([slot.id]))
  const open = vi.fn(), live = vi.fn()
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={open} onWatchLive={live} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={vi.fn()} />)
  await screen.findAllByText('予定枠テスト')
  const row = () => document.querySelector('.pl-event-slot')!
  expect(document.querySelector('.awp-watch-now')?.textContent).toContain('予定枠テスト')
  expect(document.querySelector('.awp-wanted')?.textContent).toContain('予定枠テスト')
  const { refreshVisibleData } = await import('../src/platform/lib/pullToRefresh')
  fake.listEventSlots.mockResolvedValue([{ ...slot, status: 'cancelled', note_ja: '<b>雨天のため</b>' }])
  await act(async () => { await refreshVisibleData() })
  expect(document.querySelector('.awp-watch-now')?.textContent).not.toContain('予定枠テスト')
  expect(document.querySelector('.pl-event-now')?.textContent).not.toContain('予定枠テスト')
  expect(row().textContent).toContain('中止：<b>雨天のため</b>')
  expect(row().querySelector('.pl-slot-cancellation b')).toBeNull()
  for (const button of row().querySelectorAll('button')) { expect(button.disabled).toBe(true); fireEvent.click(button) }
  expect(open).not.toHaveBeenCalled()
  expect(live).not.toHaveBeenCalled()
  // Preserve saved IDs so a reinstated slot returns, using its updated time.
  fake.listEventSlots.mockResolvedValue([{ ...slot, start_time: '11:00:00', end_time: '11:30:00' }])
  await act(async () => { await refreshVisibleData() })
  expect(row().textContent).not.toContain('中止')
  expect(row().textContent).toContain('11:00')
  expect(document.querySelector('.awp-wanted')?.textContent).toContain('11:00')
  expect(row().querySelector<HTMLButtonElement>('.pl-event-slot__want')?.disabled).toBe(false)
  vi.useRealTimers()
})


it('marks a cancelled special-final timetable entry even without a reason', async () => {
  fake.listEventSlots.mockResolvedValue([{ id: 'final', date: '2026-10-10', start_time: '18:00', end_time: '18:30', performance_type: 'special_final', ranking_position: 1, status: 'cancelled', note_ja: '', note_en: '' }])
  render(<EventDetailScreen slug={event.slug} onBack={vi.fn()} onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onTip={vi.fn()} onOpenMap={vi.fn()} onRequireAuth={vi.fn()} />)
  await screen.findByRole('heading', { name: '受賞者たち' })
  const final = document.querySelector('.awp-special article')!
  expect(final.textContent).toContain('中止')
  expect(final.textContent).toContain('18:00')
  expect(final.querySelector('button')).toBeNull()
})
