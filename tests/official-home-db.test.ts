import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll,afterAll,it,expect,describe } from 'vitest'
const owner='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',admin='30000000-0000-4000-8000-000000000003'
const db=new PGlite()
async function asRole(role:string,sql:string,user=''){await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${user}',false);`);try{return await db.query(sql)}finally{await db.exec('reset role')}}
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to authenticated,service_role;
 create table public.profiles(id uuid primary key,role text,status text);
 create table public.performers(id uuid primary key references public.profiles(id));
 create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,title text,body text,link text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
 grant select,update on public.performers to service_role;grant select on public.profiles to service_role;grant insert on public.notifications to service_role;
 insert into public.profiles values('${owner}','performer','active'),('${other}','performer','active'),('${admin}','admin','active');
 insert into public.performers values('${owner}'),('${other}');`)
 await db.exec(readFileSync('supabase/migrations/20261030213928_performer_official_home.sql','utf8'))
 await db.exec(`insert into public.performer_homepages(performer_id) values('${owner}'),('${other}')`)
},30000)
afterAll(()=>db.close())
describe('official home database isolation',()=>{
 it('browser roles cannot create or change even owned rows',async()=>{
  await expect(asRole('authenticated',`update public.performer_homepages set published=false where performer_id='${owner}'`,owner)).rejects.toThrow()
  await expect(asRole('anon','select * from public.performer_home_assets')).rejects.toThrow()
 })
 it('owner reads own drafts but cannot read another owner',async()=>{
  expect((await asRole('authenticated','select * from public.performer_homepages',owner)).rows).toHaveLength(1)
 })
 it('blocks private cases and privileged RPCs for everyone except server',async()=>{
  for(const role of ['anon','authenticated']) {
   await expect(asRole(role,'select * from haku_home_private.booking_cases',admin)).rejects.toThrow()
   await expect(asRole(role,`select public.home_submit_booking('{}','fake')`,owner)).rejects.toThrow()
   await expect(asRole(role,'select public.home_manage_cases()',admin)).rejects.toThrow()
   await expect(asRole(role,`select public.home_add_asset('{}')`,owner)).rejects.toThrow()
  }
 })
 it('enforces photo count and private defaults in real SQL',async()=>{
  for(let n=0;n<20;n++)await asRole('service_role',`select public.home_add_asset('${JSON.stringify({id:`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`,performer_id:owner,kind:'photo',title:`photo ${n}`,object_path:`${owner}/${n}.jpg`,bytes:100})}')`)
  await expect(asRole('service_role',`select public.home_add_asset('${JSON.stringify({id:'50000000-0000-4000-8000-000000000000',performer_id:owner,kind:'photo',title:'overflow',object_path:`${owner}/overflow.jpg`,bytes:100})}')`)).rejects.toThrow('asset limit')
  const result=await db.query('select published from public.performer_home_assets')
  expect(result.rows.every((r:any)=>r.published===false)).toBe(true)
 })
 it('saves request and notifies only office admins atomically',async()=>{
  const response=await asRole('service_role',`select public.home_submit_booking('{"performer_id":"${owner}","organization":"TEST"}','ip-a')`)
  expect(response.rows).toHaveLength(1)
  expect((await db.query('select user_id from public.notifications')).rows).toEqual([{user_id:admin}])
  expect((await db.query('select * from haku_home_private.booking_cases')).rows).toHaveLength(1)
 })
 it('rate limit persists across instances and does not save sixth request',async()=>{
  for(let i=0;i<4;i++)await asRole('service_role',`select public.home_submit_booking('{"performer_id":"${owner}"}','ip-a')`)
  expect((await asRole('service_role',`select public.home_submit_booking('{"performer_id":"${owner}"}','ip-a')`)).rows).toEqual([{home_submit_booking:null}])
  expect((await db.query('select * from haku_home_private.booking_cases')).rows).toHaveLength(5)
 })
 it('rolls back the case when notification insert fails',async()=>{
  await db.exec(`create function public.test_fail_notification() returns trigger language plpgsql as $$ begin raise exception 'notification unavailable'; end $$;create trigger test_notification_failure before insert on public.notifications for each row execute function public.test_fail_notification();`)
  await expect(asRole('service_role',`select public.home_submit_booking('{"performer_id":"${owner}"}','ip-rollback')`)).rejects.toThrow()
  await db.exec('drop trigger test_notification_failure on public.notifications')
  expect((await db.query('select * from haku_home_private.booking_cases')).rows).toHaveLength(5)
 })
 it('replaces at photo capacity atomically and preserves visibility, order and main photo',async()=>{
  const old='40000000-0000-4000-8000-000000000001',replacement='60000000-0000-4000-8000-000000000001'
  await db.exec(`update public.performer_home_assets set published=true,is_main=true,description='kit' where id='${old}'`)
  await asRole('service_role',`select public.home_add_asset('${JSON.stringify({id:replacement,replace_id:old,performer_id:owner,kind:'photo',title:'replacement',object_path:`${owner}/new.jpg`,bytes:200})}')`)
  expect((await db.query('select * from public.performer_home_assets')).rows).toHaveLength(20)
  expect((await db.query(`select published,is_main,description,sort_order from public.performer_home_assets where id='${replacement}'`)).rows).toEqual([{published:true,is_main:true,description:'kit',sort_order:1}])
  expect((await db.query(`select * from public.performer_home_assets where id='${old}'`)).rows).toHaveLength(0)
 })
 it('rejects cross-owner replacement and reorder; persists complete reorder in one transaction',async()=>{
  const ids=(await db.query<{id:string}>('select id from public.performer_home_assets order by sort_order')).rows.map(r=>r.id).reverse()
  await asRole('service_role',`select public.home_reorder_assets('${owner}','photo',array[${ids.map(id=>`'${id}'::uuid`).join(',')}])`)
  expect((await db.query<{id:string}>('select id from public.performer_home_assets order by sort_order')).rows.map(r=>r.id)).toEqual(ids)
  await expect(asRole('service_role',`select public.home_reorder_assets('${other}','photo',array['${ids[0]}'::uuid])`)).rejects.toThrow()
  await expect(asRole('service_role',`select public.home_add_asset('${JSON.stringify({id:'70000000-0000-4000-8000-000000000001',replace_id:ids[0],performer_id:other,kind:'photo',title:'bad',object_path:`${other}/bad.jpg`})}')`)).rejects.toThrow('replacement not owned')
 })
 it('refuses success when office has no recipients',async()=>{
  await db.exec(`update public.profiles set status='suspended' where id='${admin}'`)
  await expect(asRole('service_role',`select public.home_submit_booking('{"performer_id":"${owner}"}','ip-empty')`)).rejects.toThrow('office not configured')
 })
})
