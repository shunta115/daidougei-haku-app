import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {beforeAll,beforeEach,afterAll,expect,it} from 'vitest'
const db=new PGlite()
const owner='10000000-0000-4000-8000-000000000001',fan='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002'
const schedule='30000000-0000-4000-8000-000000000001',appearance='40000000-0000-4000-8000-000000000001'
async function collect(){await db.exec('select public.collect_notification_reminders()')}
async function claim(){return (await db.query<{id:string}>('select * from public.claim_notification_jobs(5)')).rows}
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.profiles(id uuid primary key,status text default 'active');
 create table public.performers(id uuid primary key,stage_name text,is_approved boolean default true,is_private_test boolean default false);
 create table public.follows(fan_id uuid,performer_id uuid,primary key(fan_id,performer_id));
 create table public.notification_preferences(user_id uuid primary key,appearance_in_app_enabled boolean default true,appearance_push_enabled boolean default false,push_all_enabled boolean default true,push_timezone text default 'UTC',push_start_hour int default 9,push_end_hour int default 21,push_daily_limit int default 2,push_weekly_limit int default 8);
 create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid,endpoint text,p256dh text,auth text,disabled_at timestamptz,updated_at timestamptz default now());
 create table public.performer_appearances(id uuid primary key,performer_id uuid,status text default 'published',performance_date date,start_time time,timezone text default 'UTC',starts_at timestamptz,title text,venue_name text);
 create table public.appearance_notification_events(id uuid primary key default gen_random_uuid(),appearance_id uuid,performer_id uuid,event_type text,change_fingerprint text,payload jsonb,created_at timestamptz default now(),unique(appearance_id,event_type,change_fingerprint));
 create table public.live_schedules(id uuid primary key,performer_id uuid,title text,scheduled_start_at timestamptz,status text default 'scheduled');
 create table public.live_reservations(live_schedule_id uuid,user_id uuid,primary key(live_schedule_id,user_id));
 create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,title text,body text,link text,notification_event_id uuid,kind text,meta jsonb);
 create unique index notifications_event_once on public.notifications(user_id,notification_event_id) where notification_event_id is not null;`)
 await db.exec(readFileSync('supabase/migrations/20261102192426_notification_reminders.sql','utf8'))
},120000)
beforeEach(async()=>{
 await db.exec(`reset role;truncate public.notification_jobs,public.notifications,public.appearance_notification_events,public.live_reservations,public.live_schedules,public.performer_appearances,public.push_subscriptions,public.notification_preferences,public.follows,public.performers,public.profiles cascade;
 update public.notification_reminder_control set enabled=true,push_enabled=true,activated_at=now()-interval '1 minute';
 insert into public.profiles(id) values('${owner}'),('${fan}'),('${other}');
 insert into public.performers(id,stage_name) values('${owner}','QA');
 insert into public.follows values('${fan}','${owner}');
 insert into public.notification_preferences(user_id,push_start_hour,push_end_hour) values('${fan}',0,0);
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('${fan}','https://web.push.apple.com/fake','fake','fake'),('${fan}','https://web.push.apple.com/fake2','fake','fake');
 insert into public.live_schedules values('${schedule}','${owner}','QA LIVE',now()+interval '8 minutes','scheduled');
 insert into public.live_reservations values('${schedule}','${fan}');`)
})
afterAll(async()=>db.close())
it('defaults Push OFF, while a reservation receives exactly one in-app reminder',async()=>{
 await Promise.all([collect(),collect()]);expect(await claim()).toHaveLength(0)
 expect((await db.query('select * from public.notifications')).rows).toHaveLength(1)
 expect((await db.query('select * from public.notification_jobs')).rows).toHaveLength(1)
})
it('claims one subscription per event/user, once across concurrent calls, and never reclaims uncertain outcomes',async()=>{
 await db.exec('update public.notification_preferences set live_reminder_push_enabled=true');await collect()
 expect((await Promise.all([claim(),claim(),claim()])).flat()).toHaveLength(1)
 await db.exec("update public.notification_jobs set attempted_at=now()-interval '3 minutes'");await collect()
 expect((await db.query<{status:string}>('select status from public.notification_jobs')).rows[0].status).toBe('unknown')
 expect(await claim()).toHaveLength(0)
})
it.each([
 "delete from public.live_reservations",
 "update public.live_schedules set status='cancelled'",
 "update public.live_schedules set status='started'",
 "update public.live_schedules set scheduled_start_at=now()+interval '1 hour'",
 "update public.notification_preferences set live_reminder_push_enabled=false",
 "update public.notification_preferences set push_all_enabled=false",
 "update public.notification_preferences set push_daily_limit=0",
 "update public.notification_preferences set push_weekly_limit=0",
 "update public.notification_preferences set push_timezone='invalid'",
 "update public.notification_reminder_control set push_enabled=false",
 "update public.push_subscriptions set disabled_at=now()",
 "update public.profiles set status='suspended'",
 "update public.performers set is_private_test=true",
])('revalidates immediately after claim: %s',async sql=>{
 await db.exec('update public.notification_preferences set live_reminder_push_enabled=true');await collect();const rows=await claim();expect(rows).toHaveLength(1)
 await db.exec(sql);expect((await db.query<{ok:boolean}>('select public.notification_job_eligible($1) ok',[rows[0].id])).rows[0].ok).toBe(false)
})
it('enforces quiet hours, expiry and paused collection',async()=>{
 await db.exec("update public.notification_reminder_control set enabled=false");await collect();expect(await claim()).toHaveLength(0)
 expect((await db.query('select * from public.notification_jobs')).rows).toHaveLength(0)
 await db.exec("update public.notification_reminder_control set enabled=true;update public.notification_preferences set live_reminder_push_enabled=true,push_start_hour=(extract(hour from now() at time zone 'UTC')::int+1)%24,push_end_hour=(extract(hour from now() at time zone 'UTC')::int+2)%24")
 await collect();expect(await claim()).toHaveLength(0)
 await db.exec("update public.live_schedules set scheduled_start_at=now()-interval '1 second'");await collect();expect(await claim()).toHaveLength(0)
})
it('reuses day-of event identities, creates in-app notifications for Push OFF and verifies follow changes',async()=>{
 await db.exec(`insert into public.performer_appearances values('${appearance}','${owner}','published',(now() at time zone 'UTC')::date,(now() at time zone 'UTC')::time,'UTC',now()+interval '10 minutes','QA Appearance','QA venue')`)
 await collect();await collect()
 expect((await db.query("select * from public.notifications where kind='appearance'")).rows).toHaveLength(1)
 await db.exec("update public.notification_preferences set day_of_push_enabled=true")
 const rows=await claim();expect(rows).toHaveLength(1)
 await db.exec('delete from public.follows');expect((await db.query<{ok:boolean}>('select public.notification_job_eligible($1) ok',[rows[0].id])).rows[0].ok).toBe(false)
})
it('denies browser access to queue, subscriptions metadata and scheduler RPCs',async()=>{
 await db.exec('set role authenticated')
 for(const sql of ['select * from public.notification_jobs','select * from public.notification_reminder_control','select public.collect_notification_reminders()','select * from public.claim_notification_jobs(5)']) await expect(db.exec(sql)).rejects.toThrow()
 await db.exec('reset role')
})
