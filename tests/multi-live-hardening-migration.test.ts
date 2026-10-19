import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261019173329_harden_multi_live_oauth_and_egress.sql', 'utf8')
const performer = '10000000-0000-4000-8000-000000000001'
const otherPerformer = '10000000-0000-4000-8000-000000000099'

describe('Multi LIVE atomic hardening migration', () => {
  const db = new PGlite()

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.performers (id uuid primary key);
      create table public.multi_live_destinations (
        performer_id uuid not null references public.performers(id),
        provider text not null,
        display_name text not null,
        visibility text not null,
        enabled boolean not null,
        encrypted_ingest text not null,
        encrypted_oauth text,
        egress_id text,
        status text not null,
        last_error_code text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (performer_id, provider)
      );
      insert into public.performers values ('${performer}'), ('${otherPerformer}');
      insert into public.multi_live_destinations
        (performer_id,provider,display_name,visibility,enabled,encrypted_ingest,status)
      values ('${performer}','youtube','YouTube','private',true,'encrypted','ready');
    `)
    await db.exec(migration)
  }, 30_000)

  afterAll(async () => { await db.close() })

  it('grants exactly one concurrent Egress startup lease', async () => {
    const first = await db.query<{ acquired: boolean }>("select public.acquire_multi_live_egress_lease($1,$2,90) as acquired", [performer, '20000000-0000-4000-8000-000000000002'])
    const duplicate = await db.query<{ acquired: boolean }>("select public.acquire_multi_live_egress_lease($1,$2,90) as acquired", [performer, '30000000-0000-4000-8000-000000000003'])
    expect(first.rows[0].acquired).toBe(true)
    expect(duplicate.rows[0].acquired).toBe(false)
  })

  it('consumes OAuth state once and rejects a replay or another browser binding', async () => {
    await db.exec(`insert into public.multi_live_oauth_sessions(state_hash,performer_id,browser_binding_hash,expires_at)
      values ('${'a'.repeat(64)}','${performer}','${'b'.repeat(64)}',now()+interval '10 minutes')`)
    const wrongBrowser = await db.query<{ owner: string | null }>('select public.consume_multi_live_oauth_session($1,$2) as owner', ['a'.repeat(64), 'c'.repeat(64)])
    const first = await db.query<{ owner: string | null }>('select public.consume_multi_live_oauth_session($1,$2) as owner', ['a'.repeat(64), 'b'.repeat(64)])
    const replay = await db.query<{ owner: string | null }>('select public.consume_multi_live_oauth_session($1,$2) as owner', ['a'.repeat(64), 'b'.repeat(64)])
    expect(wrongBrowser.rows[0].owner).toBeNull()
    expect(first.rows[0].owner).toBe(performer)
    expect(replay.rows[0].owner).toBeNull()
  })

  it('rejects expired OAuth state and keeps browser roles out', async () => {
    await db.exec(`insert into public.multi_live_oauth_sessions(state_hash,performer_id,browser_binding_hash,expires_at)
      values ('${'d'.repeat(64)}','${performer}','${'e'.repeat(64)}',now()-interval '1 second')`)
    const expired = await db.query<{ owner: string | null }>('select public.consume_multi_live_oauth_session($1,$2) as owner', ['d'.repeat(64), 'e'.repeat(64)])
    expect(expired.rows[0].owner).toBeNull()
    await db.exec('set role authenticated')
    await expect(db.query('select * from public.multi_live_oauth_sessions')).rejects.toThrow()
    await db.exec('reset role')
  })

  it('lets only the initiating authenticated performer complete OAuth once', async () => {
    await db.exec(`insert into public.multi_live_oauth_sessions
      (state_hash,performer_id,browser_binding_hash,completion_hash,encrypted_oauth,expires_at,consumed_at,authorized_at)
      values ('${'1'.repeat(64)}','${performer}','${'2'.repeat(64)}','${'3'.repeat(64)}','encrypted-oauth',now()+interval '10 minutes',now(),now())`)
    const wrongUser = await db.query<{ completed: boolean }>('select public.complete_multi_live_oauth_session($1,$2) as completed', ['3'.repeat(64), otherPerformer])
    const correctUser = await db.query<{ completed: boolean }>('select public.complete_multi_live_oauth_session($1,$2) as completed', ['3'.repeat(64), performer])
    const replay = await db.query<{ completed: boolean }>('select public.complete_multi_live_oauth_session($1,$2) as completed', ['3'.repeat(64), performer])
    const destination = await db.query<{ encrypted_oauth: string }>('select encrypted_oauth from public.multi_live_destinations where performer_id=$1', [performer])
    expect(wrongUser.rows[0].completed).toBe(false)
    expect(correctUser.rows[0].completed).toBe(true)
    expect(replay.rows[0].completed).toBe(false)
    expect(destination.rows[0].encrypted_oauth).toBe('encrypted-oauth')
  })
})
