import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261013_performer_appearances_and_notifications.sql', 'utf8')
const performer = '10000000-0000-4000-8000-000000000001'
const fan = '20000000-0000-4000-8000-000000000002'
const nonFollower = '20000000-0000-4000-8000-000000000003'
const pushDisabledFollower = '20000000-0000-4000-8000-000000000004'

describe('performer appearance migration', () => {
  const db = new PGlite()
  beforeAll(async () => {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create table public.profiles (id uuid primary key);
      create table public.performers (id uuid primary key references public.profiles(id), stage_name text not null);
      create table public.follows (fan_id uuid references public.profiles(id), performer_id uuid references public.performers(id), primary key(fan_id,performer_id));
      create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), title text not null, body text not null default '', link text, read_at timestamptz, created_at timestamptz default now());
      create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), endpoint text unique not null, p256dh text not null, auth text not null, created_at timestamptz default now());
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      insert into public.profiles(id) values ('${performer}'), ('${fan}'), ('${nonFollower}'), ('${pushDisabledFollower}');
      insert into public.performers(id,stage_name) values ('${performer}','紙磨呂');
      insert into public.follows values ('${fan}','${performer}');
      insert into public.follows values ('${pushDisabledFollower}','${performer}');
    `)
    await db.exec(migration)
    await db.exec(migration)
    await db.exec(`
      insert into public.notification_preferences(user_id,appearance_in_app_enabled,appearance_push_enabled,locale)
      values ('${fan}',true,true,'ja');
      insert into public.notification_preferences(user_id,appearance_in_app_enabled,appearance_push_enabled,locale)
      values ('${pushDisabledFollower}',true,false,'en');
      insert into public.push_subscriptions(user_id,endpoint,p256dh,auth)
      values ('${fan}','https://push.invalid/one','key','auth');
      insert into public.push_subscriptions(user_id,endpoint,p256dh,auth)
      values ('${pushDisabledFollower}','https://push.invalid/two','key','auth');
    `)
  }, 30_000)
  afterAll(async () => { await db.close() })

  it('is additive and leaves payments, votes, rankings, and existing rows untouched', () => {
    expect(migration).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(migration).not.toMatch(/alter\s+table\s+public\.(tips|event_votes|event_ballots|merch_orders)/i)
    expect(migration).toContain('alter table public.performer_appearances enable row level security')
    expect(migration).toContain("status in ('published','cancelled')")
    expect(migration).toContain('performer_id = auth.uid()')
  })

  it('creates one in-app and one push delivery on first publication', async () => {
    await db.exec(`insert into public.performer_appearances
      (id,performer_id,title,performance_date,start_time,end_time,timezone,starts_at,venue_name,region,country,status)
      values ('30000000-0000-4000-8000-000000000003','${performer}','秋の大道芸','2026-10-25','14:00','15:00','Asia/Tokyo',now(),'中野駅前','東京都','Japan','published')`)
    const events = await db.query<{ count: number }>('select count(*)::int as count from public.appearance_notification_events')
    const notifications = await db.query<{ count: number }>('select count(*)::int as count from public.notifications where user_id=$1', [fan])
    const deliveries = await db.query<{ count: number }>('select count(*)::int as count from public.push_notification_deliveries')
    expect(events.rows[0].count).toBe(1)
    expect(notifications.rows[0].count).toBe(1)
    expect(deliveries.rows[0].count).toBe(1)
  })

  it('never targets non-followers and excludes Push-disabled followers from Push only', async () => {
    const nonFollowerRows = await db.query<{ count: number }>('select count(*)::int as count from public.notifications where user_id=$1', [nonFollower])
    const disabledFollowerAppRows = await db.query<{ count: number }>('select count(*)::int as count from public.notifications where user_id=$1', [pushDisabledFollower])
    const disabledFollowerPushRows = await db.query<{ count: number }>('select count(*)::int as count from public.push_notification_deliveries where user_id=$1', [pushDisabledFollower])
    expect(nonFollowerRows.rows[0].count).toBe(0)
    expect(disabledFollowerAppRows.rows[0].count).toBe(1)
    expect(disabledFollowerPushRows.rows[0].count).toBe(0)
  })

  it('does not notify for a light edit or identical retry', async () => {
    await db.exec("update public.performer_appearances set description='説明だけ変更' where id='30000000-0000-4000-8000-000000000003'")
    await db.exec("update public.performer_appearances set status='published' where id='30000000-0000-4000-8000-000000000003'")
    const result = await db.query<{ count: number }>('select count(*)::int as count from public.appearance_notification_events')
    expect(result.rows[0].count).toBe(1)
  })

  it('notifies exactly once for an important venue change and cancellation', async () => {
    await db.exec("update public.performer_appearances set venue_name='新会場' where id='30000000-0000-4000-8000-000000000003'")
    await db.exec("update public.performer_appearances set venue_name='新会場' where id='30000000-0000-4000-8000-000000000003'")
    await db.exec("update public.performer_appearances set status='cancelled' where id='30000000-0000-4000-8000-000000000003'")
    const result = await db.query<{ event_type: string }>('select event_type from public.appearance_notification_events order by created_at')
    expect(result.rows.map((row) => row.event_type)).toEqual(['published', 'important_update', 'cancelled'])
  })

  it('never notifies for drafts and rejects duplicate active schedules', async () => {
    await db.exec(`insert into public.performer_appearances
      (performer_id,title,performance_date,start_time,timezone,starts_at,venue_name,status)
      values ('${performer}','下書き','2026-11-01','10:00','Asia/Tokyo',now(),'会場','draft')`)
    const before = await db.query<{ count: number }>('select count(*)::int as count from public.appearance_notification_events')
    expect(before.rows[0].count).toBe(3)
    await expect(db.exec(`insert into public.performer_appearances
      (performer_id,title,performance_date,start_time,timezone,starts_at,venue_name,status)
      values ('${performer}','下書き','2026-11-01','10:00','Asia/Tokyo',now(),'会場','draft')`)).rejects.toThrow()
  })

  it('keeps push claims service-role only and uses row locks', () => {
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('grant execute on function public.claim_appearance_push_deliveries(uuid, integer) to service_role')
    expect(migration).toContain('unique (notification_event_id, subscription_id)')
  })
})
