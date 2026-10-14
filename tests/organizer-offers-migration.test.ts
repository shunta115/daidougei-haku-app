import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261016_organizer_profiles_and_offers.sql', 'utf8')
const organizer = '10000000-0000-4000-8000-000000000001'
const performer = '20000000-0000-4000-8000-000000000002'

describe('organizer profiles and structured offers', () => {
  const db = new PGlite()
  beforeAll(async () => {
    await db.exec(`
      create schema auth; create role anon; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(id uuid primary key, role text not null);
      create table public.performers(id uuid primary key references public.profiles(id));
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      insert into public.profiles values ('${organizer}','organizer'),('${performer}','performer');
      insert into public.performers values ('${performer}');
      select set_config('request.jwt.claim.sub','${organizer}',false);
    `)
    await db.exec(migration)
    await db.exec(migration)
  }, 30_000)
  afterAll(async () => db.close())

  it('is additive and preserves legacy inquiries and production data', () => {
    expect(migration).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(migration).not.toMatch(/alter\s+table\s+public\.booking_inquiries/i)
    expect(migration).toContain('alter table public.performance_offers enable row level security')
    expect(migration).toContain("status = 'draft'")
  })

  it('forces new offers to draft and lets only the organizer send them', async () => {
    const created = await db.query<{ id: string; status: string }>(`insert into public.performance_offers
      (organizer_id,performer_id,requester_name,event_name,desired_date,location,compensation_terms,status)
      values ('${organizer}','${performer}','HAKU','Festival','2026-12-20','Tokyo','100000 JPY','accepted') returning id,status`)
    expect(created.rows[0].status).toBe('draft')
    await db.exec(`update public.performance_offers set status='sent' where id='${created.rows[0].id}'`)
    const sent = await db.query<{ status: string; sent_at: string | null }>('select status,sent_at::text from public.performance_offers')
    expect(sent.rows[0].status).toBe('sent')
    expect(sent.rows[0].sent_at).not.toBeNull()
  })

  it('prevents organizer acceptance and allows the performer to accept without editing terms', async () => {
    await expect(db.exec("update public.performance_offers set status='accepted'")).rejects.toThrow(/invalid organizer transition/)
    await db.exec(`select set_config('request.jwt.claim.sub','${performer}',false)`)
    await expect(db.exec("update public.performance_offers set compensation_terms='changed',status='accepted'")).rejects.toThrow(/only respond/)
    await db.exec("update public.performance_offers set status='accepted'")
    const result = await db.query<{ status: string; responded_at: string | null }>('select status,responded_at::text from public.performance_offers')
    expect(result.rows[0].status).toBe('accepted')
    expect(result.rows[0].responded_at).not.toBeNull()
  })
})
