import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
const migration = readFileSync('supabase/migrations/20261031010000_direct_live_lifecycle.sql','utf8')
const owner='10000000-0000-4000-8000-000000000001', other='20000000-0000-4000-8000-000000000002'
const op='30000000-0000-4000-8000-000000000003', op2='40000000-0000-4000-8000-000000000004'
const db = new PGlite()
async function user(id=owner) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`); }
async function reserve(operation=op) { return (await db.query<{id:string}>(`select public.reserve_direct_live('${owner}','${operation}','HARIBOW TEST') as id`)).rows[0].id }
async function activate(id:string,operation=op) { return db.query(`select public.activate_direct_live('${owner}','${id}','${operation}')`) }
async function finish(id:string) { return db.query(`select public.finish_direct_live('${owner}','${id}')`) }
async function state() { return (await db.query<{is_live:boolean;open:number}>(`select is_live,(select count(*)::int from public.live_sessions where ended_at is null) as open from public.performers where id='${owner}'`)).rows[0] }
describe('atomic DIRECT lifecycle SQL (ephemeral local Postgres, no connected DB)',()=>{
 beforeAll(async()=>{
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated;
   create table public.profiles(id uuid primary key,role text,status text);
   create table public.performers(id uuid primary key,stage_name text,is_approved boolean,is_live boolean default false,
    live_started_at timestamptz, live_title text,stream_url text,share_location boolean default true,lat float,lng float,location_updated_at timestamptz);
   create table public.live_sessions(id uuid primary key default gen_random_uuid(),performer_id uuid references public.performers(id),
    title text,started_at timestamptz default now(),heartbeat_at timestamptz,ended_at timestamptz,ended_reason text,event_id uuid,venue_id text,event_slot_id uuid);
   create table public.event_slots(id uuid primary key,performer_id uuid,event_id uuid,venue_id text);
   create table public.notification_probe(id uuid);
   create function public.notify_followers_live_start(uuid,text,text) returns void language sql as $$ insert into public.notification_probe values($1) $$;
   insert into public.profiles values('${owner}','performer','active'),('${other}','performer','active');
   insert into public.performers(id,stage_name,is_approved) values('${owner}','HARIBOW TEST',true),('${other}','OTHER',false);
   grant select,insert,update,delete on all tables in schema public to authenticated;
  `)
  await db.exec(migration); await db.exec(migration); await user()
 },30_000)
 afterAll(()=>db.close())
 it('denies non-owner and unapproved performers',async()=>{
  await user(other); await expect(reserve()).rejects.toThrow('LIVE_OWNER_REQUIRED')
  await expect(db.query(`select public.reserve_direct_live('${other}','${op}',null)`)).rejects.toThrow('LIVE_APPROVAL_REQUIRED'); await user()
 })
 it('reserves without public LIVE, retries idempotently, rejects competing operations',async()=>{
  const id=await reserve(); expect(await reserve()).toBe(id); expect(await state()).toEqual({is_live:false,open:0})
  await expect(reserve(op2)).rejects.toThrow('LIVE_BUSY')
  expect((await db.query('select count(*)::int as n from public.live_sessions')).rows[0]).toEqual({n:0})
 })
 it('rolls back both publication updates when activation fails midway',async()=>{
  const id=await reserve()
  await db.exec(`reset role; create function public.fail_publish() returns trigger language plpgsql as $$ begin if new.is_live then raise exception 'injected failure'; end if; return new; end $$;
   create trigger fail_publish before update on public.performers for each row execute function public.fail_publish()`)
  await user();await expect(activate(id)).rejects.toThrow('injected failure')
  expect(await state()).toEqual({is_live:false,open:0})
  expect((await db.query('select lifecycle_state from public.direct_live_leases')).rows[0]).toEqual({lifecycle_state:'preparing'})
  await db.exec('reset role; drop trigger fail_publish on public.performers');await user()
 })
 it('publishes atomically and notifies once across start retries',async()=>{
  const id=await reserve(); await activate(id); await activate(id)
  expect(await state()).toEqual({is_live:true,open:1})
  expect((await db.query('select count(*)::int as n from public.notification_probe')).rows[0]).toEqual({n:1})
 })
 it('cannot close someone else’s session or bypass the lifecycle from a legacy client',async()=>{
  const id=await reserve();await user(other);await expect(finish(id)).rejects.toThrow('LIVE_OWNER_REQUIRED');await user()
  await expect(db.query(`update public.performers set is_live=false where id='${owner}'`)).rejects.toThrow('LIVE_ATOMIC_RPC_REQUIRED')
  await expect(db.query(`update public.live_sessions set ended_at=now() where id='${id}'`)).rejects.toThrow('LIVE_ATOMIC_RPC_REQUIRED')
  await expect(db.query(`select public.close_direct_live_session('${owner}','${id}','x')`)).rejects.toThrow('permission denied')
 })
 it('ends atomically, clears location, and a delayed old end cannot stop the next LIVE',async()=>{
  const old=await reserve();await finish(old);await finish(old)
  expect(await state()).toEqual({is_live:false,open:0})
  const next=await reserve(op2);await activate(next,op2);await finish(old)
  expect(await state()).toEqual({is_live:true,open:1})
  expect((await db.query(`select share_location,lat,lng from public.performers where id='${owner}'`)).rows[0]).toEqual({share_location:false,lat:null,lng:null})
 })
 it('lease expiry closes abandoned LIVE and rejects resurrection',async()=>{
  const id=await reserve(op2)
  await db.exec(`reset role; update public.direct_live_leases set heartbeat_at=now()-interval '91 seconds' where id='${id}'`)
  expect((await db.query('select public.expire_direct_live_leases() as n')).rows[0]).toEqual({n:1});await user()
  expect(await state()).toEqual({is_live:false,open:0})
  await expect(activate(id,op2)).rejects.toThrow('LIVE_SESSION_EXPIRED')
 })
 it('cannot activate an expired preparing lease',async()=>{
  const id=await reserve()
  await db.exec(`reset role; update public.direct_live_leases set heartbeat_at=now()-interval '91 seconds' where id='${id}'`);await user()
  await expect(activate(id)).rejects.toThrow('LIVE_SESSION_EXPIRED')
  expect((await state()).is_live).toBe(false)
  const next=await reserve(op2); expect(next).not.toBe(id); expect(await state()).toEqual({is_live:false,open:0})
 })
})

it('duplicate preflight fails without deleting or modifying existing sessions',async()=>{
 const isolated=new PGlite()
 try {
  await isolated.exec(`create table public.live_sessions(id uuid,performer_id uuid,ended_at timestamptz); insert into public.live_sessions values(gen_random_uuid(),'${owner}',null),(gen_random_uuid(),'${owner}',null)`)
  await expect(isolated.exec(migration)).rejects.toThrow('Duplicate open LIVE sessions')
  await isolated.exec('rollback')
  expect((await isolated.query('select count(*)::int as n from public.live_sessions')).rows[0]).toEqual({n:2})
  await isolated.exec(`update public.live_sessions set ended_at=now(); create table public.performers(is_live boolean); insert into public.performers values(true)`)
  await expect(isolated.exec(migration)).rejects.toThrow('Stop active LIVE flags')
  await isolated.exec('rollback')
  expect((await isolated.query('select count(*)::int as n from public.live_sessions')).rows[0]).toEqual({n:2})
 } finally {await isolated.close()}
},30000)
