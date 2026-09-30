import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { extra } from '../src/i18n/extra'
import { parseEventsPath, eventVotePath, AWP_EVENT_SLUG } from '../src/app/routes'
import { canCastAnonVote, remainingVotes, isVoterId } from '../src/platform/lib/anonVoter'

it('keeps extra i18n keys aligned across ja, en, and zh-TW', () => {
  expect(Object.keys(extra.en).sort()).toEqual(Object.keys(extra.ja).sort())
  expect(Object.keys(extra.zh).sort()).toEqual(Object.keys(extra.ja).sort())
})

it('uses three-vote copy on the AWP poster landing', () => {
  expect(extra.ja.eventSub).toContain('3票')
  expect(extra.en.eventSub.toLowerCase()).toContain('3')
  expect(extra.zh.eventSub).toContain('3')
  expect(extra.ja.awpHeroFree).toContain('登録不要')
  expect(extra.ja.awpHeroFree).toContain('投票無料')
  expect(extra.ja.awpHeroBasicFree).toContain('基本機能は無料')
  expect(extra.ja.awpHeroCta).toContain('投票はこちら')
  expect(extra.ja.awpHeroNoSignUp).toBe('登録不要')
  expect(extra.ja.awpHeroVoteFree).toBe('投票無料')
  expect(extra.ja.awpHeroVoteDone).toBe('投票完了')
})

it('routes the AWP poster vote URL without a performer-specific path', () => {
  expect(eventVotePath()).toBe(`/events/${AWP_EVENT_SLUG}/vote`)
  expect(parseEventsPath(`/events/${AWP_EVENT_SLUG}/vote`)).toEqual({ kind: 'vote', slug: AWP_EVENT_SLUG })
  expect(parseEventsPath(`/events/${AWP_EVENT_SLUG}`)).toEqual({ kind: 'detail', slug: AWP_EVENT_SLUG })
})

it('enforces three unique performer votes on the client gate', () => {
  expect(canCastAnonVote({ votingOpen: true, votedIds: [], performerId: 'a' })).toBe('ok')
  expect(canCastAnonVote({ votingOpen: true, votedIds: ['a'], performerId: 'a' })).toBe('already_voted_for_performer')
  expect(canCastAnonVote({ votingOpen: true, votedIds: ['a', 'b', 'c'], performerId: 'd' })).toBe('voter_ballot_limit_reached')
  expect(canCastAnonVote({ votingOpen: false, votedIds: [], performerId: 'a' })).toBe('voting_closed')
  expect(remainingVotes(0)).toBe(3)
  expect(remainingVotes(1)).toBe(2)
  expect(remainingVotes(3)).toBe(0)
})

it('accepts HAKU anonymous voter UUIDs and rejects junk', () => {
  expect(isVoterId('11111111-1111-4111-8111-111111111111')).toBe(true)
  expect(isVoterId('device-id')).toBe(false)
  expect(isVoterId('')).toBe(false)
})

it('adds anonymous ballots without dropping legacy vote tables', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260930_awp_anonymous_three_vote.sql', import.meta.url), 'utf8')
  expect(sql).toContain('create table if not exists public.event_anon_ballots')
  expect(sql).toContain('unique (event_id, voter_id, performer_id)')
  expect(sql).toContain('voter_ballot_limit_reached')
  expect(sql).toContain('already_voted_for_performer')
  expect(sql).toContain('grant execute on function public.cast_anon_event_vote')
  expect(sql).toContain('to anon, authenticated')
  expect(sql).not.toContain('drop table public.event_ballots')
  expect(sql).not.toContain('delete from public.event_votes')
  expect(sql).not.toContain('drop table public.event_votes')
})
