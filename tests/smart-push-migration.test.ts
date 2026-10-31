import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest'
const db = new PGlite()
const owner='10000000-0000-4000-8000-000000000001', owner2='10000000-0000-4000-8000-000000000002'
const fan='20000000-0000-4000-8000-000000000001', stranger='20000000-0000-4000-8000-000000000002'
const live='30000000-0000-4000-8000-000000000001', live2='30000000-0000-4000-8000-000000000002'
const sub='40000000-0000-4000-8000-000000000001'
let event=''
async function claim(id=event) { return (await db.query(`select * from public.claim_live_start_push_deliveries('${id}',20)`)).rows }
async function queue(session=live, performer=owner) { return (await db.query<{id:string}>(`select public.enqueue_live_start_push('${session}','${performer}') id`)).rows[0].id }
beforeAll(async()=>{
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table public.profiles(id uuid primary key,status text default 'active');
    create table public.performers(id uuid primary key,stage_name text,is_live boolean default true,is_approved boolean default true,is_private_test boolean default false);
    create table public.live_sessions(id uuid primary key,performer_id uuid,started_at timestamptz default now(),ended_at timestamptz);
    create table public.notification_preferences(user_id uuid primary key,appearance_push_enabled boolean default false,locale text default 'ja');
    create table public.push_subscriptions(id uuid primary key,user_id uuid,endpoint text,p256dh text,auth text,disabled_at timestamptz);
    create table public.follows(fan_id uuid,performer_id uuid,primary key(fan_id,performer_id));
    grant select,update on public.live_sessions to authenticated;
    alter table public.live_sessions enable row level security;
    create policy owner on public.live_sessions to authenticated using(performer_id=auth.uid()) with check(performer_id=auth.uid());
  `)
  const migration=readFileSync('supabase/migrations/20261031181110_smart_push_live.sql','utf8')
  await db.exec(migration); await db.exec(migration)
},120000)
beforeEach(async()=>{
  await db.exec(`reset role; truncate public.live_push_deliveries,public.live_push_events,public.live_sessions,public.notification_preferences,public.push_subscriptions,public.follows,public.performers,public.profiles cascade;
    insert into public.profiles(id) values('${owner}'),('${owner2}'),('${fan}'),('${stranger}');
    insert into public.performers(id,stage_name) values('${owner}','Performer A'),('${owner2}','Performer B');
    insert into public.live_sessions(id,performer_id,follower_push_requested) values('${live}','${owner}',true),('${live2}','${owner2}',true);
    insert into public.notification_preferences(user_id,live_push_enabled,push_start_hour,push_end_hour) values('${fan}',true,0,0);
    insert into public.push_subscriptions values('${sub}','${fan}','https://push.example.test/fake','fake','fake',null);
    insert into public.follows values('${fan}','${owner}'),('${fan}','${owner2}');`)
  event=await queue()
  await db.exec(`update public.live_push_events set created_at=now()-interval '60 seconds'`)
})
afterAll(async()=>db.close())
it('waits 45 seconds before claim and expires old starts',async()=>{
  await db.exec(`update public.live_push_events set created_at=now()`); expect(await claim()).toHaveLength(0)
  await db.exec(`update public.live_push_events set created_at=now()-interval '6 minutes'`); expect(await claim()).toHaveLength(0)
  expect((await db.query<{status:string}>('select status from public.live_push_deliveries')).rows[0].status).toBe('suppressed')
})
it('does not inherit appearance consent for LIVE and has a default OFF intent',async()=>{
  await db.exec(`update public.notification_preferences set live_push_enabled=false,appearance_push_enabled=true`)
  expect(await claim()).toHaveLength(0)
  await db.exec(`insert into public.live_sessions(id,performer_id) values('30000000-0000-4000-8000-000000000003','${owner}')`)
  expect((await db.query<{follower_push_requested:boolean}>("select follower_push_requested from public.live_sessions where id='30000000-0000-4000-8000-000000000003'")).rows[0].follower_push_requested).toBe(false)
})
it('deduplicates events and reserves only one attempt, including parallel calls',async()=>{
  expect(await queue()).toBe(event)
  const claims=await Promise.all([claim(),claim(),claim()]); expect(claims.flat()).toHaveLength(1)
  await db.exec("update public.live_push_deliveries set status='failed',updated_at=now()-interval '20 minutes'")
  expect(await claim()).toHaveLength(0)
})
it.each([
  `delete from public.follows where performer_id='${owner}'`,
  'update public.notification_preferences set live_push_enabled=false',
  'update public.notification_preferences set push_all_enabled=false',
  "update public.push_subscriptions set disabled_at=now()",
  `update public.live_sessions set ended_at=now() where id='${live}'`,
  `update public.live_sessions set follower_push_requested=false where id='${live}'`,
  `update public.performers set is_private_test=true where id='${owner}'`,
  `update public.performers set is_approved=false where id='${owner}'`,
  `update public.profiles set status='suspended' where id='${fan}'`,
  `update public.live_push_events set cancelled_at=now()`,
])('suppresses revoked/ineligible recipients: %s',async sql=>{await db.exec(sql);expect(await claim()).toHaveLength(0)})
it('revalidates consent after claim and does not mix performer payloads',async()=>{
  const a=await claim() as {delivery_id:string,payload:{performerId:string}}[]
  expect(a[0].payload.performerId).toBe(owner)
  await db.exec('update public.notification_preferences set live_push_enabled=false')
  expect((await db.query<{ok:boolean}>(`select public.live_push_delivery_eligible('${a[0].delivery_id}') ok`)).rows[0].ok).toBe(false)
})
it('enforces quiet hours in recipient time and discards instead of postponing LIVE',async()=>{
  await db.exec(`update public.notification_preferences set push_timezone='Asia/Tokyo',push_start_hour=(extract(hour from now() at time zone 'Asia/Tokyo')::int+1)%24,push_end_hour=(extract(hour from now() at time zone 'Asia/Tokyo')::int+2)%24`)
  expect(await claim()).toHaveLength(0)
})
it('fails closed on invalid time zones',async()=>{await db.exec("update public.notification_preferences set push_timezone='invalid'");expect(await claim()).toHaveLength(0)})
it('enforces recipient limits across simultaneous performers',async()=>{
  await db.exec('update public.notification_preferences set push_daily_limit=1')
  const other=await queue(live2,owner2); await db.exec("update public.live_push_events set created_at=now()-interval '60 seconds'")
  const all=await Promise.all([claim(),claim(other)]);expect(all.flat()).toHaveLength(1)
})
it('suppresses a second start by the same performer on the same local day',async()=>{
  expect(await claim()).toHaveLength(1)
  await db.exec(`insert into public.live_sessions(id,performer_id,follower_push_requested) values('30000000-0000-4000-8000-000000000003','${owner}',true)`)
  const next=await queue('30000000-0000-4000-8000-000000000003');await db.exec("update public.live_push_events set created_at=now()-interval '60 seconds'")
  expect(await claim(next)).toHaveLength(0)
})
it('protects queue and subscriptions from browser role access and rejects another owner intent',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[stranger]);await db.exec('set role authenticated')
  try {
    await expect(db.query('select * from public.live_push_deliveries')).rejects.toThrow()
    await expect(db.query(`select public.enqueue_live_start_push('${live}','${owner}')`)).rejects.toThrow()
    await expect(db.query(`select public.set_live_push_intent('${live}',true)`)).rejects.toThrow()
  } finally {await db.exec('reset role')}
})
it('enforces the weekly cap even when today has no previous attempt',async()=>{
  await db.exec('update public.notification_preferences set push_weekly_limit=0');expect(await claim()).toHaveLength(0)
})
it('fails closed at the global 500-attempt daily budget',async()=>{
  await db.exec(`
    insert into public.live_sessions(id,performer_id) select gen_random_uuid(),'${owner}' from generate_series(1,500);
    insert into public.live_push_events(live_session_id,performer_id,payload) select id,performer_id,'{}'::jsonb from public.live_sessions where id not in ('${live}','${live2}');
    insert into public.live_push_deliveries(event_id,user_id,subscription_id,status,attempts) select id,'${fan}','${sub}','failed',1 from public.live_push_events where id<>'${event}';
  `)
  expect(await claim()).toHaveLength(0)
})
