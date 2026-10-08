import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261009_official_device_vote_desk.sql', 'utf8')
const api = readFileSync('src/platform/lib/api.ts', 'utf8')
const adminApi = readFileSync('api/ops/_hakuAdmin.ts', 'utf8')

describe('official AWP admin vote ranking', () => {
  it('redefines the admin desk from eligible official device ballots', () => {
    expect(migration).toContain('create or replace function public.admin_event_vote_desk')
    expect(migration).toContain('from public.event_device_ballots b')
    expect(migration).toContain('l.is_voting_eligible is true')
    expect(migration).toContain('count(distinct b.device_hash)')
    expect(migration).toContain("'votes_per_device'")
  })

  it('does not silently fall back to legacy ballots for finalist ranking', () => {
    const rankingFunction = api.slice(api.indexOf('export async function listAdminVoteRanking'), api.indexOf('export async function createBookingInquiry'))
    expect(rankingFunction).toContain('getAdminVoteDesk(eventId)')
    expect(rankingFunction).not.toContain("from('event_ballots')")
    expect(rankingFunction).not.toContain('catch')
  })

  it('labels the existing admin fallback as official device ballots', () => {
    expect(adminApi).toContain("source: 'event_device_ballots'")
    expect(adminApi).not.toContain("source: 'event_ballots'")
  })
})
