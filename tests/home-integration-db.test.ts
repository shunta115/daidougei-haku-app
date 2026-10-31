import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { homeDiscovery } from '../src/platform/lib/homeDiscovery'
import type { Performer } from '../src/platform/lib/types'
const db=new PGlite()
const performer='10000000-0000-4000-8000-000000000001', fan='20000000-0000-4000-8000-000000000002', other='30000000-0000-4000-8000-000000000003', hidden='40000000-0000-4000-8000-000000000004'
const schedule='50000000-0000-4000-8000-000000000005', privateSchedule='60000000-0000-4000-8000-000000000006', session='70000000-0000-4000-8000-000000000007'
async function asUser<T>(id:string,run:()=>Promise<T>){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);try{return await run()}finally{await db.exec('reset role')}}
beforeAll(async()=>{
 await db.exec(`create schema auth;create role anon;create role authenticated;grant usage on schema auth,public to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.is_admin() returns boolean language sql stable as $$select false$$;
 create function public.can_navigate_live(uuid) returns boolean language sql stable as $$select false$$;
 create table public.profiles(id uuid primary key,status text default 'active');
 create table public.performers(id uuid primary key references profiles(id),is_approved boolean default true,is_private_test boolean default false);
 create table public.live_sessions(id uuid primary key,performer_id uuid references performers(id),started_at timestamptz default now(),heartbeat_at timestamptz default now(),ended_at timestamptz);
 create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,title text,body text,link text,kind text,meta jsonb);
 grant select on profiles,performers,live_sessions to anon,authenticated;`)
 await db.exec(readFileSync('supabase/migrations/20261018092439_live_reservations_and_viewer_analytics.sql','utf8'))
 await db.exec(`insert into profiles(id) values('${performer}'),('${fan}'),('${other}'),('${hidden}');insert into performers(id,is_private_test) values('${performer}',false),('${hidden}',true);
 insert into live_schedules(id,performer_id,title,scheduled_start_at) values('${schedule}','${performer}','public',now()+interval '1 hour'),('${privateSchedule}','${hidden}','private',now()+interval '1 hour');
 insert into live_sessions(id,performer_id) values('${session}','${performer}');`)
},60_000)
afterAll(async()=>db.close())
it('runs the existing reservation migration through roles, duplicate reserve, account isolation, cancel, start notification and LIVE evidence',async()=>{
 await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false)")
 expect((await db.query('select id from live_schedules')).rows).toEqual([{id:schedule}]);await db.exec('reset role')
 const insert=()=>db.exec(`insert into live_reservations(live_schedule_id,user_id) values('${schedule}','${fan}')`)
 await asUser(fan,insert)
 await asUser(fan,async()=>{
  await expect(insert()).rejects.toMatchObject({code:'23505'})
  await expect(db.exec(`insert into live_reservations(live_schedule_id,user_id) values('${schedule}','${other}')`)).rejects.toMatchObject({code:'42501'})
  await expect(db.exec(`insert into live_reservations(live_schedule_id,user_id) values('${privateSchedule}','${fan}')`)).rejects.toMatchObject({code:'42501'})
 })
 await asUser(other,async()=>{
  expect((await db.query('select * from live_reservations')).rows).toHaveLength(0)
  expect((await db.query(`delete from live_reservations where live_schedule_id='${schedule}' returning *`)).rows).toHaveLength(0)
 })
 await asUser(fan,()=>db.exec(`delete from live_reservations where live_schedule_id='${schedule}' and user_id='${fan}'`))
 expect((await db.query('select * from live_reservations')).rows).toHaveLength(0)
 await asUser(fan,insert)
 await asUser(performer,async()=>{
  expect((await db.query(`select notify_live_reservations_started('${schedule}','${session}') n`)).rows).toEqual([{n:1}])
  expect((await db.query(`select notify_live_reservations_started('${schedule}','${session}') n`)).rows).toEqual([{n:0}])
 })
 expect((await db.query('select * from notifications')).rows).toHaveLength(1)
 const people=[{id:performer,stage_name:'real SQL fixture',is_approved:true,is_private_test:false,is_live:true}] as Performer[]
 const sessions=(await db.query<any>('select performer_id,started_at::text,heartbeat_at::text,ended_at::text from live_sessions')).rows
 expect(homeDiscovery(people,people,[],[],sessions,Date.now()).live).toHaveLength(1)
 expect(homeDiscovery(people,people,[],[],sessions,Date.now()+121000).live).toHaveLength(0)
 await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false)")
 expect((await db.query('select id from live_schedules')).rows).toHaveLength(0);await db.exec('reset role')
})
