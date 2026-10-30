import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261030105928_live_start_web_push_queue.sql', 'utf8')
const owner = '10000000-0000-4000-8000-000000000001'
const fan = '20000000-0000-4000-8000-000000000002'
const stranger = '30000000-0000-4000-8000-000000000003'
const privateOwner = '40000000-0000-4000-8000-000000000004'
const live = '50000000-0000-4000-8000-000000000005'
const privateLive = '60000000-0000-4000-8000-000000000006'
const ended = '70000000-0000-4000-8000-000000000007'
const subscription = '80000000-0000-4000-8000-000000000008'

// Isolated in-process Postgres: no Supabase connection, credentials, or Push send.
describe('optional LIVE start Push migration', () => {
  const db = new PGlite()
  let eventId = ''
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.profiles(id uuid primary key, status text not null default 'active');
      create table public.performers(id uuid primary key references public.profiles(id), stage_name text, is_live boolean, is_approved boolean, is_private_test boolean);
      create table public.live_sessions(id uuid primary key, performer_id uuid references public.performers(id), title text, ended_at timestamptz);
      create table public.notification_preferences(user_id uuid primary key references public.profiles(id), appearance_push_enabled boolean not null default false, locale text not null default 'ja');
      create table public.push_subscriptions(id uuid primary key, user_id uuid references public.profiles(id), endpoint text, p256dh text, auth text, disabled_at timestamptz);
      create table public.follows(fan_id uuid, performer_id uuid, unique(fan_id,performer_id));
      insert into public.profiles(id) values ('${owner}'),('${fan}'),('${stranger}'),('${privateOwner}');
      insert into public.performers values ('${owner}','Test performer',true,true,false),('${privateOwner}','Private performer',true,true,true);
      insert into public.live_sessions values ('${live}','${owner}','Test LIVE',null),('${privateLive}','${privateOwner}','Private LIVE',null),('${ended}','${owner}','Ended LIVE',now());
      insert into public.notification_preferences(user_id,appearance_push_enabled) values ('${fan}',true),('${stranger}',true);
      insert into public.push_subscriptions values ('${subscription}','${fan}','https://push.example.test/only-test','test-p256dh','test-auth',null);
      insert into public.follows values ('${fan}','${owner}');
    `)
    await db.exec(migration)
    await db.exec(migration)
  }, 30_000)
  afterAll(async () => { await db.close() })

  it('keeps LIVE Push opt-in separate from existing appearance consent', async () => {
    const result = await db.query<{ live_push_enabled: boolean }>('select live_push_enabled from public.notification_preferences')
    expect(result.rows.every((row) => row.live_push_enabled === false)).toBe(true)
    const first = await db.query<{ id: string }>(`select public.enqueue_live_start_push('${live}','${owner}') id`)
    eventId = first.rows[0].id
    expect((await db.query('select * from public.live_push_deliveries')).rows).toHaveLength(0)
  })

  it('creates one event per session and one delivery per opted-in subscription', async () => {
    await db.exec(`update public.notification_preferences set live_push_enabled=true where user_id='${fan}'`)
    const first = await db.query<{ id: string }>(`select public.enqueue_live_start_push('${live}','${owner}') id`)
    const second = await db.query<{ id: string }>(`select public.enqueue_live_start_push('${live}','${owner}') id`)
    expect(first.rows[0].id).toBe(eventId)
    expect(second.rows[0].id).toBe(eventId)
    expect((await db.query('select * from public.live_push_events')).rows).toHaveLength(1)
    expect((await db.query('select * from public.live_push_deliveries')).rows).toHaveLength(1)
  })

  it('rejects another owner, private TEST LIVE, and ended LIVE', async () => {
    await expect(db.query(`select public.enqueue_live_start_push('${live}','${stranger}')`)).rejects.toThrow('live_not_eligible')
    await expect(db.query(`select public.enqueue_live_start_push('${privateLive}','${privateOwner}')`)).rejects.toThrow('live_not_eligible')
    await expect(db.query(`select public.enqueue_live_start_push('${ended}','${owner}')`)).rejects.toThrow('live_not_eligible')
  })

  it('does not expose queue contents or privileged enqueue to browser roles', async () => {
    await db.exec('set role authenticated')
    try {
      await expect(db.query('select * from public.live_push_deliveries')).rejects.toThrow()
      await expect(db.query(`select public.enqueue_live_start_push('${live}','${owner}')`)).rejects.toThrow()
    } finally { await db.exec('reset role') }
  })

  it('claims a delivery once while another dispatch is processing it', async () => {
    const first = await db.query(`select * from public.claim_live_start_push_deliveries('${eventId}',100)`)
    const second = await db.query(`select * from public.claim_live_start_push_deliveries('${eventId}',100)`)
    expect(first.rows).toHaveLength(1)
    expect(second.rows).toHaveLength(0)
  })

  it('suppresses queued delivery after unfollow, consent withdrawal, or LIVE end', async () => {
    await db.exec(`update public.live_push_deliveries set status='queued'; delete from public.follows where fan_id='${fan}' and performer_id='${owner}'`)
    expect((await db.query(`select * from public.claim_live_start_push_deliveries('${eventId}',100)`)).rows).toHaveLength(0)
    await db.exec(`insert into public.follows values ('${fan}','${owner}')`)
    await db.exec(`update public.live_push_deliveries set status='queued'; update public.notification_preferences set live_push_enabled=false where user_id='${fan}'`)
    expect((await db.query(`select * from public.claim_live_start_push_deliveries('${eventId}',100)`)).rows).toHaveLength(0)
    expect((await db.query<{status: string}>('select status from public.live_push_deliveries')).rows[0].status).toBe('suppressed')
    await db.exec(`update public.notification_preferences set live_push_enabled=true where user_id='${fan}'; update public.live_push_deliveries set status='queued'; update public.live_sessions set ended_at=now() where id='${live}'`)
    expect((await db.query(`select * from public.claim_live_start_push_deliveries('${eventId}',100)`)).rows).toHaveLength(0)
  })
})
