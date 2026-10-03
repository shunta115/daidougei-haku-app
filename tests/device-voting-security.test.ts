import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const api = readFileSync(new URL('../api/votes/device.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20261004_awp_device_voting.sql', import.meta.url), 'utf8')

it('uses an HttpOnly same-site server-issued device cookie', () => {
  expect(api).toContain('HttpOnly')
  expect(api).toContain('SameSite=Lax')
  expect(api).toContain("createHash('sha256')")
  expect(api).toContain("fetchSite === 'cross-site'")
  expect(api).not.toContain('localStorage')
})

it('allows only the service role to mutate official device ballots', () => {
  expect(migration).toContain('revoke all on function public.cast_device_event_vote')
  expect(migration).toContain('grant execute on function public.cast_device_event_vote(uuid, uuid, text) to service_role')
  expect(migration).toContain('revoke all on table public.event_device_ballots from anon, authenticated')
})

it('checks event enablement, reception, eligibility, uniqueness and total limit', () => {
  for (const marker of [
    'not rule.voting_enabled',
    'not rule.voting_open',
    'voting_not_started',
    'voting_ended',
    'l.is_voting_eligible is true',
    'device_vote_limit_reached',
    'unique (event_id, device_hash, performer_id)',
  ]) expect(migration).toContain(marker)
})

it('preserves legacy ballots while excluding them from official results', () => {
  expect(migration).not.toMatch(/delete\s+from\s+public\.event_(votes|ballots)/i)
  expect(migration).not.toMatch(/truncate/i)
  const resultFunction = migration.slice(migration.indexOf('create or replace function public.get_public_event_results'))
  expect(resultFunction).toContain('from public.event_device_ballots')
  expect(resultFunction).not.toContain('from public.event_ballots')
})
