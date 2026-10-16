// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { EventVoteRule } from '../src/platform/lib/api'

const fake = vi.hoisted(() => ({
  rule: {} as EventVoteRule,
  upsert: vi.fn(),
}))
vi.mock('../src/platform/lib/supabase', () => ({
  requireSupabase: () => ({ from: (table: string) => {
    expect(table).toBe('event_vote_rules')
    return { upsert: fake.upsert }
  } }),
  supabaseAuthHeaders: vi.fn(),
}))
vi.mock('../src/catalog/liveCatalog', () => ({ refreshLiveCatalog: vi.fn() }))
vi.mock('../src/platform/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/lib/api')>()
  const event = { id: 'awp', slug: 'award-winning-performers-2026', name_ja: 'AWP', status: 'published' }
  return {
    ...actual,
    getFeaturedEvent: async () => event,
    listManagedEvents: async () => [event],
    getTipFeeBps: async () => 1500,
    listEventVenues: async () => [],
    listEventSlots: async () => [],
    listEventLineupRows: async () => [],
    listApprovedPerformers: async () => [],
    listEventLiveSessions: async () => [],
    listAdminVoteRanking: async () => [],
    getEventVoteRule: async () => ({ ...fake.rule }),
    // Exercise the real saveEventVoteRule through the database boundary.
  }
})
import { AdminEventScreen } from '../src/platform/screens/AdminEventOps'

const deviceLabel = '1端末あたりの票数（イベント全期間）'
beforeEach(() => {
  fake.rule = {
    event_id: 'awp', voting_enabled: true, voting_open: true,
    votes_per_device: 3, votes_per_voter: 7, votes_per_user_per_day: 2,
    allow_anonymous: false, voting_starts_at: null, voting_ends_at: null, updated_at: '',
  }
  fake.upsert.mockReset().mockImplementation(async (patch) => {
    fake.rule = { ...fake.rule, ...patch }
    return { error: null }
  })
})
afterEach(cleanup)
async function openVoting() {
  render(<AdminEventScreen />)
  await screen.findByRole('option', { name: 'AWP（published）' })
  fireEvent.click(screen.getByRole('button', { name: '投票', exact: true }))
  await screen.findByText('公式端末投票（AWP）')
}

it.each([1, 5, 10])('persists the official device limit %i and reloads it without changing legacy settings', async (limit) => {
  await openVoting()
  const select = screen.getByLabelText(deviceLabel) as HTMLSelectElement
  expect(select.value).toBe('3')
  expect(Array.from(select.options, (option) => Number(option.value))).toEqual([1,2,3,4,5,6,7,8,9,10])
  fireEvent.change(select, { target: { value: String(limit) } })
  fireEvent.click(screen.getByRole('button', { name: '投票設定を保存' }))
  await screen.findByText('投票設定を保存しました')
  expect(fake.upsert).toHaveBeenCalledWith(expect.objectContaining({
    event_id: 'awp', votes_per_device: limit, votes_per_voter: 7,
    votes_per_user_per_day: 2, allow_anonymous: false, voting_enabled: true, voting_open: true,
  }))
  cleanup()
  await openVoting()
  expect((screen.getByLabelText(deviceLabel) as HTMLSelectElement).value).toBe(String(limit))
})

it('separates legacy edits from the official device limit', async () => {
  await openVoting()
  fireEvent.click(screen.getByText('旧方式の投票設定（公式端末投票には適用されません）'))
  fireEvent.change(screen.getByLabelText('旧匿名投票：1投票者あたりの票数'), { target: { value: '9' } })
  fireEvent.click(screen.getByLabelText('旧匿名投票を許可'))
  fireEvent.click(screen.getByRole('button', { name: '投票設定を保存' }))
  await screen.findByText('投票設定を保存しました')
  expect(fake.rule).toMatchObject({ votes_per_device: 3, votes_per_voter: 9, allow_anonymous: true })
})

it.each([['投票 OPEN', true], ['投票 STOP', false]] as const)('%s changes only reception, retaining unsaved edits', async (name, open) => {
  await openVoting()
  fireEvent.change(screen.getByLabelText(deviceLabel), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name }))
  await waitFor(() => expect(fake.upsert).toHaveBeenCalledTimes(1))
  expect(fake.upsert.mock.calls[0][0]).toEqual({ event_id: 'awp', voting_open: open, updated_at: expect.any(String) })
  expect(fake.rule.votes_per_device).toBe(3)
  expect((screen.getByLabelText(deviceLabel) as HTMLSelectElement).value).toBe('5')
  expect((screen.getByLabelText('投票受付中') as HTMLInputElement).checked).toBe(open)
})

it('does not report a successful STOP when persistence fails', async () => {
  await openVoting()
  fake.upsert.mockResolvedValueOnce({ error: new Error('保存エラー') })
  fireEvent.click(screen.getByRole('button', { name: '投票 STOP' }))
  await screen.findByText('保存エラー')
  expect((screen.getByLabelText('投票受付中') as HTMLInputElement).checked).toBe(true)
})

it('preserves older rules without adding an unsupported device column', async () => {
  delete fake.rule.votes_per_device
  delete fake.rule.voting_enabled
  await openVoting()
  expect(screen.queryByLabelText(deviceLabel)).toBeNull()
  expect(screen.getByText(/端末投票の設定を取得できません/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '投票設定を保存' }))
  await screen.findByText('投票設定を保存しました')
  expect(fake.upsert.mock.calls[0][0]).not.toHaveProperty('votes_per_device')
  expect(fake.upsert.mock.calls[0][0]).not.toHaveProperty('voting_enabled')
})

it('explains disabled device voting without enabling it on OPEN', async () => {
  fake.rule.voting_enabled = false
  await openVoting()
  expect(screen.getByText(/OPENにしても端末投票は開始されません/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '投票 OPEN' }))
  await waitFor(() => expect(fake.upsert).toHaveBeenCalledTimes(1))
  expect(fake.rule.voting_enabled).toBe(false)
})

it.each([['投票 OPEN', true], ['投票 STOP', false]] as const)('%s preserves unsaved JST bounds and the device limit until explicit save', async (name, open) => {
  fake.rule.voting_starts_at = '2026-10-10T03:00:00.000Z'
  fake.rule.voting_ends_at = '2026-10-12T09:30:00.000Z'
  await openVoting()
  const startLabel = '投票開始日時（日本時間・JST）'
  const endLabel = '投票終了日時（日本時間・JST）'
  expect((screen.getByLabelText(startLabel) as HTMLInputElement).value).toBe('2026-10-10T12:00')
  fireEvent.change(screen.getByLabelText(startLabel), { target: { value: '2026-10-10T00:00' } })
  fireEvent.change(screen.getByLabelText(endLabel), { target: { value: '2026-10-12T19:45' } })
  fireEvent.change(screen.getByLabelText(deviceLabel), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name }))
  await waitFor(() => expect(fake.upsert).toHaveBeenCalledTimes(1))
  expect(fake.upsert.mock.calls[0][0]).toEqual({ event_id: 'awp', voting_open: open, updated_at: expect.any(String) })
  expect(fake.rule).toMatchObject({ votes_per_device: 3, voting_starts_at: '2026-10-10T03:00:00.000Z', voting_ends_at: '2026-10-12T09:30:00.000Z' })
  expect((screen.getByLabelText(startLabel) as HTMLInputElement).value).toBe('2026-10-10T00:00')
  expect((screen.getByLabelText(endLabel) as HTMLInputElement).value).toBe('2026-10-12T19:45')
  expect((screen.getByLabelText(deviceLabel) as HTMLSelectElement).value).toBe('5')
  // Restore the AWP limit and explicitly persist it alongside the JST bounds.
  fireEvent.change(screen.getByLabelText(deviceLabel), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: '投票設定を保存' }))
  await screen.findByText('投票設定を保存しました')
  expect(fake.rule).toMatchObject({ votes_per_device: 3, voting_open: open, voting_starts_at: '2026-10-09T15:00:00.000Z', voting_ends_at: '2026-10-12T10:45:00.000Z' })
  cleanup()
  await openVoting()
  expect((screen.getByLabelText(startLabel) as HTMLInputElement).value).toBe('2026-10-10T00:00')
  expect((screen.getByLabelText(endLabel) as HTMLInputElement).value).toBe('2026-10-12T19:45')
  expect((screen.getByLabelText(deviceLabel) as HTMLSelectElement).value).toBe('3')
})
