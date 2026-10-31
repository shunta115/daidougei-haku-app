import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect,it } from 'vitest'
const migration=readFileSync('supabase/migrations/20261031092522_revoke_public_tip_truncate.sql','utf8')
async function fixture(){
 const db=new PGlite()
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.tips(id integer primary key, amount integer, status text);
 insert into public.tips values(1,100,'pending');
 alter table public.tips enable row level security;
 create policy read_tips on public.tips for select using (true);
 grant all on public.tips to anon,authenticated,service_role;`)
 return db
}
it('removes only TRUNCATE and preserves financial DML, RLS and data',async()=>{
 const db=await fixture()
 try{
  const before=await db.query(`select relrowsecurity,relacl::text from pg_class where oid='public.tips'::regclass`)
  await db.exec(`begin;${migration}commit;`)
  const permissions=await db.query<{role:string,truncate:boolean,select:boolean,insert:boolean,update:boolean}>(`select r as role,has_table_privilege(r,'public.tips','TRUNCATE') as truncate,has_table_privilege(r,'public.tips','SELECT') as select,has_table_privilege(r,'public.tips','INSERT') as insert,has_table_privilege(r,'public.tips','UPDATE') as update from unnest(array['anon','authenticated','service_role']) r`)
  expect(permissions.rows.map(x=>x.truncate)).toEqual([false,false,true])
  expect(permissions.rows.every(x=>x.select&&x.insert&&x.update)).toBe(true)
  expect((await db.query(`select * from public.tips`)).rows).toEqual([{id:1,amount:100,status:'pending'}])
  expect((await db.query(`select relrowsecurity from pg_class where oid='public.tips'::regclass`)).rows[0]).toEqual({relrowsecurity:true})
  expect(before.rows[0]).toHaveProperty('relrowsecurity',true)
  expect((await db.query(`select policyname from pg_policies where tablename='tips'`)).rows).toEqual([{policyname:'read_tips'}])
  await db.exec(`begin;set local role service_role;update public.tips set status='succeeded' where id=1;`)
  expect((await db.query(`select status from public.tips where id=1`)).rows[0]).toEqual({status:'succeeded'})
  await db.exec(`rollback;`)
 }finally{await db.close()}
},30000)
it('also revokes an inherited PUBLIC grant and is safe to reapply',async()=>{
 const db=await fixture()
 try{
  await db.exec(`grant truncate on public.tips to public;begin;${migration}commit;begin;${migration}commit;`)
  expect((await db.query(`select has_table_privilege('anon','public.tips','TRUNCATE') as allowed`)).rows[0]).toEqual({allowed:false})
 }finally{await db.close()}
},30000)
it('fails closed if a separate inherited role still grants destructive access',async()=>{
 const db=await fixture()
 try{
  await db.exec(`create role unsafe_group;grant truncate on public.tips to unsafe_group;grant unsafe_group to anon;`)
  await expect(db.exec(`begin;${migration}commit;`)).rejects.toThrow('TRUNCATE remains inherited')
  await db.exec('rollback')
  expect((await db.query(`select * from public.tips`)).rows).toHaveLength(1)
 }finally{await db.close()}
},30000)
it('stops if even one required service-role DML privilege is missing',async()=>{
 const db=await fixture()
 try{
  await db.exec('revoke insert on public.tips from service_role')
  await expect(db.exec(`begin;${migration}commit;`)).rejects.toThrow('financial DML privileges missing')
  await db.exec('rollback')
 }finally{await db.close()}
},30000)
