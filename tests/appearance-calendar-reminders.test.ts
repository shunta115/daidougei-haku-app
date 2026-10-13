import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appearanceToIcs } from '../src/platform/lib/appearanceIcs'
import type { PerformerAppearance } from '../src/platform/lib/types'

const migration = readFileSync('supabase/migrations/20261014050000_appearance_calendar_reminders.sql', 'utf8')
const owner = '10000000-0000-4000-8000-000000000001'
const fan = '20000000-0000-4000-8000-000000000002'
const guest = '30000000-0000-4000-8000-000000000003'
const appearanceId = '40000000-0000-4000-8000-000000000004'

describe('appearance calendar, favorites, and reminders', () => {
  const db = new PGlite()
  beforeAll(async () => {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.profiles(id uuid primary key);
      create table public.performers(id uuid primary key references public.profiles(id));
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      create table public.performer_appearances(
        id uuid primary key, performer_id uuid not null references public.performers(id), starts_at timestamptz not null,
        status text not null, published_at timestamptz
      );
      insert into public.profiles values ('${owner}'),('${fan}'),('${guest}');
      insert into public.performers values ('${owner}'),('${guest}');
      insert into public.performer_appearances values ('${appearanceId}','${owner}','2026-12-01T10:00:00Z','published',now());
      select set_config('request.jwt.claim.sub','${fan}',false);
    `)
    await db.exec(migration)
    await db.exec(migration)
  }, 30_000)
  afterAll(async () => db.close())

  it('is additive, repeatable, and never enables a delivery job', () => {
    expect(migration).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(migration).not.toMatch(/cron|net\.http|pg_net/i)
    expect(migration).toContain('alter table public.appearance_favorites enable row level security')
    expect(migration).toContain('alter table public.appearance_reminders enable row level security')
    expect(migration).toContain('revoke update on public.appearance_reminders from authenticated')
  })

  it('derives reminder time from the authoritative appearance start', async () => {
    await db.exec(`insert into public.appearance_reminders(user_id,appearance_id,offset_minutes,scheduled_for)
      values ('${fan}','${appearanceId}',60,'1970-01-01T00:00:00Z')`)
    const result = await db.query<{ scheduled_for: string; status: string }>('select scheduled_for::text,status from public.appearance_reminders')
    expect(new Date(result.rows[0].scheduled_for).toISOString()).toBe('2026-12-01T09:00:00.000Z')
    expect(result.rows[0].status).toBe('pending')
  })

  it('reschedules pending reminders and cancels them when a performance is postponed', async () => {
    await db.exec(`update public.performer_appearances set starts_at='2026-12-01T12:00:00Z' where id='${appearanceId}'`)
    let result = await db.query<{ scheduled_for: string; status: string; enabled: boolean }>('select scheduled_for::text,status,enabled from public.appearance_reminders')
    expect(new Date(result.rows[0].scheduled_for).toISOString()).toBe('2026-12-01T11:00:00.000Z')
    expect(result.rows[0]).toMatchObject({ status: 'pending', enabled: true })
    await db.exec(`update public.performer_appearances set status='postponed' where id='${appearanceId}'`)
    result = await db.query('select scheduled_for::text,status,enabled from public.appearance_reminders')
    expect(result.rows[0]).toMatchObject({ status: 'cancelled', enabled: false })
  })

  it('keeps multi-performer invitations pending until an explicit response', async () => {
    await db.exec(`insert into public.appearance_performers(appearance_id,performer_id) values ('${appearanceId}','${guest}')`)
    const result = await db.query<{ invitation_status: string }>('select invitation_status from public.appearance_performers')
    expect(result.rows[0].invitation_status).toBe('pending')
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`)
    await expect(db.exec(`update public.appearance_performers set invitation_status='accepted' where appearance_id='${appearanceId}' and performer_id='${guest}'`)).rejects.toThrow(/owner cannot accept/)
    await db.exec(`select set_config('request.jwt.claim.sub','${guest}',false)`)
    await db.exec(`update public.appearance_performers set invitation_status='accepted' where appearance_id='${appearanceId}' and performer_id='${guest}'`)
    const accepted = await db.query<{ invitation_status: string }>('select invitation_status from public.appearance_performers')
    expect(accepted.rows[0].invitation_status).toBe('accepted')
  })
})

describe('ICS export', () => {
  it('escapes content and uses stable UTC timestamps', () => {
    const row = {
      id: appearanceId, performer_id: owner, title: 'Show, A;B', performance_date: '2026-12-01', start_time: '19:00:00', end_time: null,
      timezone: 'Asia/Tokyo', starts_at: '2026-12-01T10:00:00Z', ends_at: null, venue_name: 'Tokyo; Hall', venue_address: '1, Chiyoda',
      region: 'Tokyo', country: 'Japan', description: 'Line 1\nLine 2', admission_type: 'free', admission_details: '', image_url: null,
      ticket_url: null, is_live_planned: false, rain_policy: '', organizer_info: '', notes: '', status: 'published', published_at: '2026-10-14T00:00:00Z',
      cancelled_at: null, created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z',
    } satisfies PerformerAppearance
    const ics = appearanceToIcs(row, 'Performer')
    expect(ics).toContain('DTSTART:20261201T100000Z')
    expect(ics).toContain('DTEND:20261201T110000Z')
    expect(ics).toContain('SUMMARY:Show\\, A\\;B')
    expect(ics).toContain('LOCATION:Tokyo\\; Hall 1\\, Chiyoda')
  })
})
