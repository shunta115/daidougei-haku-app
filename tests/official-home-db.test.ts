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
 create table public.admin_members(user_id uuid,permission text,status text,email text);
 create table public.performers(id uuid primary key references public.profiles(id) on delete cascade);
 create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,title text,body text,link text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
 grant select on public.performers to service_role;grant select on public.profiles to service_role;grant insert on public.notifications to service_role;
 insert into public.profiles values('${owner}','performer','active'),('${other}','performer','active'),('${admin}','admin','active');
 insert into public.admin_members(user_id,permission,status) values('${admin}','admin','active');
 insert into public.performers values('${owner}'),('${other}');`)
 await db.exec(readFileSync('supabase/migrations/20261030213928_performer_official_home.sql','utf8'))
 await db.exec(`insert into public.performer_homepages(performer_id) values('${owner}'),('${other}')`)
},60000)
afterAll(()=>db.close())
describe('official home database isolation',()=>{
 it('fails closed on reapply without changing existing feature or legacy data',async()=>{
  await expect(db.exec(readFileSync('supabase/migrations/20261030213928_performer_official_home.sql','utf8'))).rejects.toThrow('already exists')
  await db.exec('rollback')
  expect((await db.query('select * from public.profiles')).rows).toHaveLength(3)
  expect((await db.query('select * from public.performer_homepages')).rows).toHaveLength(2)
 })
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
 it('preserves old table permissions and grants only office membership lookup columns',async()=>{
  const rights=await db.query(`select has_any_column_privilege('service_role','public.performers','UPDATE') as performer_update,
   has_column_privilege('service_role','public.admin_members','user_id','SELECT') as member_id,
   has_column_privilege('service_role','public.admin_members','permission','SELECT') as permission,
   has_column_privilege('service_role','public.admin_members','status','SELECT') as status,
   has_column_privilege('service_role','public.admin_members','email','SELECT') as email`)
  expect(rights.rows).toEqual([{performer_update:false,member_id:true,permission:true,status:true,email:false}])
  for(const role of ['anon','authenticated'])await expect(asRole(role,'select user_id from public.admin_members',admin)).rejects.toThrow()
 })
 it('denies all maintenance RPCs to browser roles and keeps trigger entry points private',async()=>{
  const result=await db.query<{name:string;anon:boolean;authenticated:boolean;service:boolean;definer:boolean;config:string[]}>(`select p.proname as name,p.prosecdef as definer,p.proconfig as config,
   has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
   has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'home_%'`)
  expect(result.rows).toHaveLength(9)
  expect(result.rows.every(r=>!r.anon&&!r.authenticated&&r.service&&!r.definer&&r.config.some(c=>c.startsWith('search_path=')))).toBe(true)
  const tables=await db.query<{rls:boolean}>(`select c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (n.nspname='haku_home_private' or (n.nspname='public' and c.relname in ('performer_homepages','performer_home_assets')))`);expect(tables.rows).toHaveLength(7);expect(tables.rows.every(t=>t.rls)).toBe(true)
  const triggers=await db.query<{prosecdef:boolean;proconfig:string[];callable:boolean}>(`select prosecdef,proconfig,has_function_privilege('service_role',p.oid,'EXECUTE') as callable from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='haku_home_private'`)
  expect(triggers.rows.every(r=>r.prosecdef&&!r.callable&&r.proconfig.some(c=>c.startsWith('search_path=')))).toBe(true)
 })
 it('records office access without keeping personal search strings; protects legal holds',async()=>{
  const caseId=(await db.query<{id:string}>('select id from haku_home_private.booking_cases order by created_at limit 1')).rows[0].id
  await asRole('service_role',`select public.home_manage_cases(null,null,'private-search@example.invalid','','${admin}')`)
  expect(JSON.stringify((await db.query('select * from haku_home_private.case_audit')).rows)).not.toContain('private-search')
  await asRole('service_role',`select public.home_manage_cases('${caseId}','quoting','','','${admin}')`)
  expect((await db.query(`select hold_basis from haku_home_private.booking_cases where id='${caseId}'`)).rows).toEqual([{hold_basis:'statutory_review'}])
  await db.exec(`update haku_home_private.booking_cases set retention_due_at=now()-interval '1 day',hold_review_due_at=now()-interval '1 day' where id='${caseId}'`)
  const result=await asRole('service_role',`select public.home_retention('${admin}',true)`)
  expect((result.rows[0] as any).home_retention).toMatchObject({held_overdue:1,processed:0})
  await expect(asRole('service_role',`select public.home_case_privacy('${caseId}','${admin}','erase')`)).rejects.toThrow('legal hold')
  await asRole('service_role',`select public.home_case_privacy('${caseId}','${admin}','release_hold')`)
  await asRole('service_role',`select public.home_retention('${admin}',true)`)
  expect((await db.query(`select payload,performer_id,anonymized_at is not null as erased from haku_home_private.booking_cases where id='${caseId}'`)).rows).toEqual([{payload:{},performer_id:null,erased:true}])
 })
 it('expires normal requests, shortens declined retention and never extends via status changes',async()=>{
  const id=(await db.query<{id:string}>('select id from haku_home_private.booking_cases where anonymized_at is null limit 1')).rows[0].id
  const old=(await db.query<{due:string}>(`select retention_due_at::text as due from haku_home_private.booking_cases where id='${id}'`)).rows[0].due
  await asRole('service_role',`select public.home_manage_cases('${id}','declined','','','${admin}')`)
  const next=(await db.query<{shorter:boolean}>(`select retention_due_at<'${old}'::timestamptz as shorter from haku_home_private.booking_cases where id='${id}'`)).rows[0]
  expect(next.shorter).toBe(true)
  await db.exec(`update haku_home_private.booking_cases set retention_due_at=now()-interval '1 day' where id='${id}'`)
  const preview=await asRole('service_role',`select public.home_retention('${admin}',false)`)
  expect((preview.rows[0] as any).home_retention).toMatchObject({due:1,processed:0})
  expect((await db.query(`select anonymized_at from haku_home_private.booking_cases where id='${id}'`)).rows).toEqual([{anonymized_at:null}])
  await asRole('service_role',`select public.home_retention('${admin}',true)`)
  expect((await db.query(`select payload from haku_home_private.booking_cases where id='${id}'`)).rows).toEqual([{payload:{}}])
 })
 it('soft deletion unpublishes feature data and queues bytes without touching other performers',async()=>{
  await asRole('service_role',`select public.home_add_asset('${JSON.stringify({id:'80000000-0000-4000-8000-000000000001',performer_id:other,kind:'pdf',title:'other pdf',object_path:`${other}/80000000-0000-4000-8000-000000000001.pdf`,bytes:100})}')`)
  await db.exec(`update public.profiles set status='deleted' where id='${other}'`)
  expect((await db.query(`select * from public.performer_home_assets where performer_id='${other}'`)).rows).toHaveLength(0)
  expect((await db.query(`select * from public.performer_homepages where performer_id='${other}'`)).rows).toHaveLength(0)
  expect((await db.query(`select * from public.performer_home_assets where performer_id='${owner}'`)).rows).toHaveLength(20)
  expect((await db.query(`select object_path from haku_home_private.storage_cleanup where performer_id='${other}'`)).rows).toHaveLength(1)
 })
 it('hard account deletion cascades media, detaches cases and survives Storage cleanup failure',async()=>{
  await db.exec(`delete from public.profiles where id='${owner}'`)
  expect((await db.query(`select * from public.performers where id='${owner}'`)).rows).toHaveLength(0)
  expect((await db.query('select * from public.performer_home_assets')).rows).toHaveLength(0)
  expect((await db.query('select * from haku_home_private.asset_locks')).rows).toHaveLength(0)
  expect((await db.query(`select performer_id,payload ? 'performer_id' as duplicate from haku_home_private.booking_cases`)).rows.every((r:any)=>r.performer_id===null&&!r.duplicate)).toBe(true)
  const first=await asRole('service_role','select public.home_claim_cleanup(null,100)')
  const leased=(first.rows[0] as any).home_claim_cleanup
  expect(leased.length).toBeGreaterThan(0)
  // No ack simulates Storage outage. Lease prevents simultaneous deletion and is retryable.
  expect((await asRole('service_role','select public.home_claim_cleanup(null,100)')).rows).toEqual([{home_claim_cleanup:[]}])
  await db.exec(`update haku_home_private.storage_cleanup set lease_until=now()-interval '1 second' where processed_at is null`)
  const retried=(await asRole('service_role','select public.home_claim_cleanup(null,100)')).rows[0] as any
  expect(retried.home_claim_cleanup).toHaveLength(leased.length)
  const item=retried.home_claim_cleanup[0]
  expect((await asRole('service_role',`select public.home_ack_cleanup('${item.path_hash}','00000000-0000-4000-8000-000000000000')`)).rows).toEqual([{home_ack_cleanup:false}])
  await asRole('service_role',`select public.home_ack_cleanup('${item.path_hash}','${item.lease_token}')`)
  expect((await db.query(`select object_path,performer_id,processed_at is not null as done from haku_home_private.storage_cleanup where path_hash='${item.path_hash}'`)).rows).toEqual([{object_path:null,performer_id:null,done:true}])
 })

})
