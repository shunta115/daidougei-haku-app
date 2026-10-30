import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect,it } from 'vitest'
const source=readFileSync('supabase/migrations/20261031010100_direct_live_expiry_schedule.sql','utf8')
// PGlite has no pg_cron binary: only the extension-install statement is omitted.
// Stub cron's documented (jobname,username) unique key. This checks our SQL guards, NOT the scheduler daemon.
const schedule=source.replace('create extension if not exists pg_cron with schema pg_catalog;','')
it('refuses reversed order and creates no cron job',async()=>{
 const db=new PGlite();try{await expect(db.exec(schedule)).rejects.toThrow('migration 1');await db.exec('rollback');expect((await db.query("select to_regclass('cron.job') as job")).rows[0]).toEqual({job:null})}finally{await db.close()}
},30000)
it('reapplies without duplication, aborts foreign-owner/duplicate metadata without deleting it',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated; create role anon; create schema cron;
 create table public.direct_live_leases(id uuid);
 create function public.renew_direct_live_lease(uuid,uuid,uuid) returns boolean language sql as $$ select true $$;
 create function public.observe_direct_live_host(uuid,uuid,timestamptz,boolean) returns text language sql as $$ select 'healthy'::text $$;
 create function public.expire_direct_live_leases() returns int language sql as $$ select 0 $$;
 create function public.close_direct_live_session(uuid,uuid,text) returns boolean language sql as $$ select true $$;
 create function public.notify_followers_live_start(uuid,text,text) returns void language plpgsql as $$ begin return; end $$;
 revoke all on function public.expire_direct_live_leases(),public.close_direct_live_session(uuid,uuid,text),public.notify_followers_live_start(uuid,text,text),public.renew_direct_live_lease(uuid,uuid,uuid),public.observe_direct_live_host(uuid,uuid,timestamptz,boolean) from public,anon,authenticated;
 create table cron.job(jobid bigint generated always as identity,jobname text,username text,schedule text,command text,active boolean default true,unique(jobname,username));
 create function cron.schedule(n text,s text,c text) returns bigint language sql as $$
 insert into cron.job(jobname,username,schedule,command) values(n,current_user,s,c)
 on conflict(jobname,username) do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;`)
 await db.exec("grant execute on function public.renew_direct_live_lease(uuid,uuid,uuid) to authenticated")
 await expect(db.exec(schedule)).rejects.toThrow('Unsafe lifecycle EXECUTE');await db.exec('rollback')
 expect((await db.query('select count(*)::int as n from cron.job')).rows[0]).toEqual({n:0})
 await db.exec("revoke execute on function public.renew_direct_live_lease(uuid,uuid,uuid) from authenticated")
 await db.exec(schedule);const first=(await db.query('select jobid from cron.job')).rows
 await db.exec(schedule);expect((await db.query('select jobid from cron.job')).rows).toEqual(first)
 await db.exec('update cron.job set active=false')
 await expect(db.exec(schedule)).rejects.toThrow('paused');await db.exec('rollback')
 expect((await db.query('select active from cron.job')).rows[0]).toEqual({active:false})
 await db.exec("update cron.job set active=true,command='select 1'")
 await expect(db.exec(schedule)).rejects.toThrow('command mismatch');await db.exec('rollback')
 await db.exec("update cron.job set command='select public.expire_direct_live_leases()'")
 await db.exec("update cron.job set username='different_owner'")
 await expect(db.exec(schedule)).rejects.toThrow('owner mismatch');await db.exec('rollback')
 expect((await db.query('select count(*)::int as n from cron.job')).rows[0]).toEqual({n:1})
 await db.exec("insert into cron.job(jobname,username) values('haku-direct-live-expiry','third_owner')")
 await expect(db.exec(schedule)).rejects.toThrow('Duplicate cron');await db.exec('rollback')
 expect((await db.query('select count(*)::int as n from cron.job')).rows[0]).toEqual({n:2})
 }finally{await db.close()}
},30000)
