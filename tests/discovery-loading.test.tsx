// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const fake = vi.hoisted(() => ({
  search: vi.fn(),
  live: vi.fn(),
  event: vi.fn(),
  lineup: vi.fn(),
  follows: vi.fn(),
  oshi: vi.fn(),
  ranking: vi.fn(),
}))

vi.mock('../src/platform/lib/api', () => ({
  searchPerformers: fake.search,
  listLivePerformers: fake.live,
  getFeaturedEvent: fake.event,
  listEventLineup: fake.lineup,
  listFollowedPerformers: fake.follows,
  listOshiPerformers: fake.oshi,
  listVoteRankingNamed: fake.ranking,
}))
vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../src/platform/lib/track', () => ({ useTrackView: vi.fn() }))
vi.mock('../src/i18n/LangProvider', () => ({ useLang: () => ({ lang: 'ja' }) }))

import { FanHomeScreen } from '../src/platform/screens/FanHomeScreen'
import { SearchScreen } from '../src/platform/screens/SearchScreen'

const performer = {
  id: 'performer-1', stage_name: '表示テスト', genre: 'ジャグリング', bio: '', country: '日本', city: '東京',
  photo_url: null, support_blurb: '', stripe_account_id: null, stripe_onboarding_complete: false,
  is_approved: true, is_live: false, live_started_at: null, stream_url: null, share_location: false,
  lat: null, lng: null, location_updated_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.live.mockResolvedValue([])
  fake.event.mockResolvedValue(null)
  fake.lineup.mockResolvedValue([])
  fake.follows.mockResolvedValue([])
  fake.oshi.mockResolvedValue([])
  fake.ranking.mockResolvedValue([])
})
afterEach(cleanup)

describe('performer discovery loading states', () => {
  it('does not show the HOME empty state before the performer request completes', async () => {
    let resolveSearch!: (value: (typeof performer)[]) => void
    fake.search.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve }))
    render(<FanHomeScreen onOpenPerformer={vi.fn()} onWatchLive={vi.fn()} onOpenSearch={vi.fn()} onOpenLiveList={vi.fn()} onOpenMap={vi.fn()} onTip={vi.fn()} />)
    expect(screen.getByLabelText('パフォーマーを読み込み中')).toBeTruthy()
    expect(screen.queryByText('まだ知らない才能に会いにいこう。')).toBeNull()
    resolveSearch([performer])
    expect(await screen.findByRole('heading', { level: 1, name: '表示テスト' })).toBeTruthy()
  })

  it('does not show a no-results message while search is loading', async () => {
    let resolveSearch!: (value: (typeof performer)[]) => void
    fake.search.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve }))
    render(<SearchScreen onOpenPerformer={vi.fn()} />)
    expect((await screen.findByRole('status')).textContent).toContain('読み込み中')
    expect(screen.queryByText('条件を少し変えると、別のパフォーマーに出会えます。')).toBeNull()
    resolveSearch([performer])
    expect(await screen.findByText('表示テスト')).toBeTruthy()
  })
})
