import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'

const db = new PGlite()
const migrationNames = [
  '20261014065602_performer_appearances_and_notifications_20261014.sql',
  '20261029085105_add_appearance_map_coordinates.sql',
  '20261029090008_add_day_of_appearance_reminders.sql',
  '20261030182434_harden_notification_client_inserts.sql',
]
const performer = '10000000-0000-4000-8000-000000000001'
const fan = '10000000-0000-4000-8000-000000000002'
const other = '10000000-0000-4000-8000-000000000003'
const appearance = '20000000-0000-4000-8000-000000000001'

beforeAll(async () => {
  await db.exec(`
    create schema auth;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function public.is_admin() returns boolean language sql stable as $$ select false $$;
    create table public.profiles (id uuid primary key);
    create table public.performers (id uuid primary key references public.profiles(id), stage_name text not null);
    create table public.follows (fan_id uuid references public.profiles(id), performer_id uuid references public.performers(id), primary key(fan_id,performer_id));
    create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), title text not null, body text not null default '', link text, read_at timestamptz, created_at timestamptz default now());
    alter table public.notifications enable row level security;
    grant select, insert, update on public.notifications to authenticated;
    create policy notifications_own on public.notifications for select using(user_id=auth.uid());
    create policy notifications_insert_system on public.notifications for insert with check(auth.uid() is not null);
    create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), endpoint text unique not null, p256dh text not null, auth text not null, created_at timestamptz default now());
    insert into public.profiles values ('${performer}'),('${fan}'),('${other}');
    insert into public.performers values ('${performer}','Release test');
    insert into public.follows values ('${fan}','${performer}');
  `)
  for (const file of migrationNames) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  await db.exec(`insert into public.performer_appearances
    (id,performer_id,title,performance_date,start_time,end_time,timezone,starts_at,venue_name,status,venue_lat,venue_lng)
    values ('${appearance}','${performer}','Release test',(now() at time zone 'Asia/Tokyo')::date,'12:00','13:00','Asia/Tokyo',now(),'Test park','published',35.7,139.7)`)
}, 30_000)
afterAll(async () => { await db.close() })

it('computes JST timestamps and rejects a partial coordinate pair', async () => {
  const result = await db.query<{ correct: boolean }>(`select starts_at = (performance_date + start_time) at time zone timezone as correct from performer_appearances where id='${appearance}'`)
  expect(result.rows[0].correct).toBe(true)
  await expect(db.exec(`update performer_appearances set venue_lng=null where id='${appearance}'`)).rejects.toThrow(/check constraint/)
})

it('denies direct notification creation, including other recipients', async () => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${fan}'`)
  try {
    await expect(db.exec(`insert into notifications(user_id,title) values ('${other}','forged')`)).rejects.toThrow(/permission denied/)
    await expect(db.exec(`insert into notifications(user_id,title) values ('${fan}','forged')`)).rejects.toThrow(/permission denied/)
  } finally { await db.exec('reset role') }
})

it('creates reminders only for the caller, once, and respects preferences/status', async () => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${fan}'`)
  const first = await db.query<{ count: number }>('select ensure_my_day_of_appearance_reminders() as count')
  const second = await db.query<{ count: number }>('select ensure_my_day_of_appearance_reminders() as count')
  expect(first.rows[0].count).toBe(1)
  expect(second.rows[0].count).toBe(0)
  await db.exec(`set request.jwt.claim.sub='${other}'`)
  expect((await db.query<{ count: number }>('select ensure_my_day_of_appearance_reminders() as count')).rows[0].count).toBe(0)
  await db.exec('reset role')
  await db.exec(`update performer_appearances set status='cancelled' where id='${appearance}';
    insert into notification_preferences(user_id,appearance_in_app_enabled) values ('${fan}',false)`)
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${fan}'`)
  expect((await db.query<{ count: number }>('select ensure_my_day_of_appearance_reminders() as count')).rows[0].count).toBe(0)
  await db.exec('reset role')
})

it('keeps system inserts available and rejects anonymous reminder calls', async () => {
  await db.exec('set role service_role')
  await db.exec(`insert into notifications(user_id,title) values ('${other}','system')`)
  await db.exec('reset role; set role anon')
  await expect(db.query('select ensure_my_day_of_appearance_reminders()')).rejects.toThrow(/permission denied/)
  await db.exec('reset role')
})
