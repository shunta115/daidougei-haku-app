// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { EventVoteRule } from '../src/platform/lib/api'

const fake = vi.hoisted(() => ({
  rule: {} as EventVoteRule,
  getEventVoteRule: vi.fn(),
  saveEventVoteRule: vi.fn(),
}))
vi.mock('../src/platform/lib/api', () => ({
  listManagedEvents: async () => [{ id: 'awp', name_ja: 'AWP', status: 'published' }],
  getFeaturedEvent: async () => null,
  getTipFeeBps: async () => 1500,
  listEventVenues: async () => [],
  listEventSlots: async () => [],
  listEventLineupRows: async () => [],
  listApprovedPerformers: async () => [],
  listEventLiveSessions: async () => [],
  listAdminVoteRanking: async () => [],
  listOfficialNavigators: async () => [],
  getEventVoteRule: fake.getEventVoteRule,
  saveEventVoteRule: fake.saveEventVoteRule,
}))
vi.mock('../src/catalog/liveCatalog', () => ({ refreshLiveCatalog: async () => {} }))
vi.mock('../src/platform/lib/supabase', () => ({ supabaseAuthHeaders: async () => ({}) }))
import { AdminEventScreen } from '../src/platform/screens/AdminEventOps'

beforeEach(() => {
  fake.rule = {
    event_id: 'awp', voting_open: false, votes_per_user_per_day: 1,
    voting_starts_at: '2026-10-10T03:00:00+00:00',
    voting_ends_at: '2026-10-12T09:30:00+00:00', updated_at: '',
  }
  fake.getEventVoteRule.mockImplementation(async () => ({ ...fake.rule }))
  fake.saveEventVoteRule.mockImplementation(async (_id: string, patch: Partial<EventVoteRule>) => {
    // Simulate the DB returning UTC timestamptz after every save.
    fake.rule = { ...fake.rule, ...patch }
    for (const field of ['voting_starts_at', 'voting_ends_at'] as const) {
      if (fake.rule[field]) fake.rule[field] = new Date(fake.rule[field]).toISOString()
    }
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

async function openVoting() {
  render(<AdminEventScreen />)
  await screen.findByRole('option', { name: 'AWP（published）' })
  fireEvent.click(screen.getByRole('button', { name: '投票', exact: true }))
  return {
    start: await screen.findByLabelText('投票開始日時（日本時間・JST）') as HTMLInputElement,
    end: screen.getByLabelText('投票終了日時（日本時間・JST）') as HTMLInputElement,
  }
}
async function saveAndReload() {
  const reads = fake.getEventVoteRule.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: '投票設定を保存' }))
  await waitFor(() => expect(fake.getEventVoteRule.mock.calls.length).toBeGreaterThan(reads))
}

it('keeps both UTC-loaded bounds unchanged across repeated saves and reloads', async () => {
  const { start, end } = await openVoting()
  expect(start.value).toBe('2026-10-10T12:00')
  expect(end.value).toBe('2026-10-12T18:30')
  for (let i = 0; i < 2; i++) {
    await saveAndReload()
    expect(start.value).toBe('2026-10-10T12:00')
    expect(end.value).toBe('2026-10-12T18:30')
    expect(fake.rule.voting_starts_at).toBe('2026-10-10T03:00:00.000Z')
    expect(fake.rule.voting_ends_at).toBe('2026-10-12T09:30:00.000Z')
  }
})

it('saves edited JST bounds as UTC, including previous-day midnight, then reloads identically', async () => {
  const { start, end } = await openVoting()
  fireEvent.change(start, { target: { value: '2026-10-10T00:00' } })
  fireEvent.change(end, { target: { value: '2026-10-12T19:45' } })
  await saveAndReload()
  expect(fake.saveEventVoteRule).toHaveBeenCalledWith('awp', expect.objectContaining({
    voting_starts_at: '2026-10-09T15:00:00.000Z',
    voting_ends_at: '2026-10-12T10:45:00.000Z',
  }))
  expect(start.value).toBe('2026-10-10T00:00')
  expect(end.value).toBe('2026-10-12T19:45')
  await saveAndReload()
  expect(start.value).toBe('2026-10-10T00:00')
  expect(end.value).toBe('2026-10-12T19:45')
})

it('clears both bounds to null and reloads empty inputs', async () => {
  const { start, end } = await openVoting()
  fireEvent.change(start, { target: { value: '' } })
  fireEvent.change(end, { target: { value: '' } })
  await saveAndReload()
  expect(fake.rule.voting_starts_at).toBeNull()
  expect(fake.rule.voting_ends_at).toBeNull()
  expect(start.value).toBe('')
  expect(end.value).toBe('')
})
