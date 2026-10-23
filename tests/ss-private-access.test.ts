import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261019124837_allow_ss_test_performer_private_access.sql'),
  'utf8',
)
const verifier = readFileSync(
  resolve(process.cwd(), 'supabase/verify_ss_test_performer_private_access_readonly.sql'),
  'utf8',
)

describe('s.s private Test Performer access migration', () => {
  it('fails closed unless both verified identities and the active assignment exist', () => {
    expect(migration).toContain("u.id = '1c21f421-5561-4213-8759-962873accfa0'::uuid")
    expect(migration).toContain("u.id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid")
    expect(migration).toContain("lower(u.email) = 'eventnowjapan@gmail.com'")
    expect(migration).toMatch(/a\.active is true/)
    expect(migration).toMatch(/raise exception .*rolling back/i)
  })

  it('keeps organizer access and limits the fan exception to the exact UUID pair', () => {
    expect(migration).toMatch(/navigator\.role = 'organizer'/)
    expect(migration).toMatch(/navigator\.role = 'fan'/)
    expect(migration).toMatch(
      /a\.navigator_id = '1c21f421-5561-4213-8759-962873accfa0'::uuid/,
    )
    expect(migration).toMatch(
      /a\.performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid/,
    )
  })

  it('does not turn the fan exception into performer or room write access', () => {
    expect(migration).toMatch(/alter policy performers_navigator_update[\s\S]*navigator\.role = 'organizer'/)
    expect(migration).toMatch(/alter policy live_sessions_navigator_write[\s\S]*navigator\.role = 'organizer'/)
  })

  it('adds authenticated read policies scoped to s.s and Test Performer', () => {
    expect(migration).toMatch(/create policy performers_ss_test_performer_read[\s\S]*to authenticated/)
    expect(migration).toMatch(/create policy live_sessions_ss_test_performer_read[\s\S]*to authenticated/)
    expect(migration).toMatch(/auth\.uid\(\) = '1c21f421-5561-4213-8759-962873accfa0'::uuid/g)
    expect(migration).toMatch(/id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid/)
    expect(migration).toMatch(/performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid/)
  })

  it('does not expose the security-definer function to anonymous callers', () => {
    expect(migration).toMatch(/revoke all on function public\.can_navigate_live\(uuid\) from public, anon/i)
    expect(migration).toMatch(/grant execute on function public\.can_navigate_live\(uuid\) to authenticated/i)
    expect(migration).toMatch(/set search_path = pg_catalog, public/)
    expect(migration).toMatch(/alter policy live_schedules_public_read[\s\S]*to anon, authenticated/)
    expect(migration).toMatch(/create policy live_schedules_assigned_private_read[\s\S]*to authenticated/)
  })

  it('ships a rollback-only three-actor production verifier', () => {
    expect(verifier.match(/begin read only;/g)).toHaveLength(3)
    expect(verifier.match(/rollback;/g)).toHaveLength(3)
    expect(verifier).toContain('1c21f421-5561-4213-8759-962873accfa0')
    expect(verifier).toContain('36ff70ed-c08a-440a-84f8-d3051bec9f68')
    expect(verifier).toContain('29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1')
    expect(verifier).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im)
  })
})
