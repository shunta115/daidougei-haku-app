// Local-only adapter: real PostgreSQL semantics in PGlite; in-memory Storage.
// Never imported by the application or a deployed API.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
export const OWNER='10000000-0000-4000-8000-000000000001'
export const OTHER='20000000-0000-4000-8000-000000000002'
export const ADMIN='30000000-0000-4000-8000-000000000003'
export const db=new PGlite()
export const objects=new Map<string,Blob>()
export const ready=(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table profiles(id uuid primary key,role text,status text,email text);
 create table performers(id uuid primary key,stage_name text,genre text,bio text,photo_url text,is_approved boolean,is_private_test boolean default false);
 create table notifications(id uuid default gen_random_uuid(),user_id uuid,title text,body text,link text);
 create table admin_members(user_id uuid,permission text,status text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
 insert into profiles values('${OWNER}','performer','active','test-owner@example.invalid'),('${OTHER}','performer','active','test-other@example.invalid'),('${ADMIN}','admin','active','test-admin@example.invalid');
 insert into performers(id,stage_name,genre,bio,is_approved) values('${OWNER}','検証用パフォーマー','ジャグリング','ローカル検証専用のプロフィール',true),('${OTHER}','他の検証用出演者','','',true);
 insert into admin_members values('${ADMIN}','admin','active');`)
 await db.exec(readFileSync('supabase/migrations/20261030213928_performer_official_home.sql','utf8'))
})()
const identifier=(s:string)=>{s=s.trim();if(!/^[a-z_]+$/.test(s))throw new Error('invalid identifier');return `"${s}"`}
class Query{
 table:string;columns='*';filters:Array<[string,unknown]>=[];operation='select';payload:Record<string,unknown>={};sort='';one=false
 constructor(table:string){this.table=table}
 select(columns='*'){this.columns=columns;return this}
 eq(key:string,value:unknown){this.filters.push([key,value]);return this}
 order(key:string){this.sort=key;return this}
 maybeSingle(){this.one=true;return this}
 upsert(value:Record<string,unknown>){this.operation='upsert';this.payload=value;return this}
 update(value:Record<string,unknown>){this.operation='update';this.payload=value;return this}
 delete(){this.operation='delete';return this}
 async then(resolve:any,reject:any){
  await ready
  try{
   const params:unknown[]=[];const param=(v:unknown)=>{params.push(v);return `$${params.length}`}
   const table=identifier(this.table)
   const keys=Object.keys(this.payload)
   let sql=this.operation==='select'?`select ${this.columns==='*'?'*':this.columns.split(',').map(identifier).join(',')} from ${table}`:this.operation==='delete'?`delete from ${table}`:this.operation==='update'?`update ${table} set ${keys.map(k=>`${identifier(k)}=${param(this.payload[k])}`).join(',')}`:`insert into ${table} (${keys.map(identifier).join(',')}) values (${keys.map(k=>param(this.payload[k])).join(',')}) on conflict(performer_id) do update set ${keys.filter(k=>k!=='performer_id').map(k=>`${identifier(k)}=excluded.${identifier(k)}`).join(',')}`
   if(this.filters.length)sql+=' where '+this.filters.map(([key,v])=>`${identifier(key)}=${param(v)}`).join(' and ')
   if(this.sort)sql+=' order by '+identifier(this.sort)+',id'
   const result=await db.query(sql,params)
   return resolve({data:this.one?result.rows[0]||null:result.rows,error:null})
  }catch(error){return resolve({data:null,error})}
 }
}
export const sb={
 from:(table:string)=>new Query(table),
 rpc:async(name:string,args:Record<string,unknown>)=>{await ready;try{const keys=Object.keys(args);const result=await db.query(`select public.${identifier(name)}(${keys.map((key,i)=>`${identifier(key)} => $${i+1}`).join(',')}) as result`,Object.values(args));return {data:(result.rows[0] as any)?.result,error:null}}catch(error){return {data:null,error}}},
 storage:{from:()=>({
  upload:async(path:string,bytes:Uint8Array,options:{contentType:string})=>{if(objects.has(path))return {error:new Error('exists')};objects.set(path,new Blob([bytes as any],{type:options.contentType}));return {data:{path},error:null}},
  download:async(path:string)=>({data:objects.get(path),error:objects.has(path)?null:new Error('missing')}),
  remove:async(paths:string[])=>{for(const path of paths)objects.delete(path);return {error:null}},
 })},
}
export const getAdminSupabase=()=>sb
export const requireAuthUser=async(req:any,res:any)=>{const id=String(req.headers.authorization||'').replace('Bearer ','');if(![OWNER,OTHER,ADMIN].includes(id)){res.status(401).json({error:'Unauthorized'});return null}return {id,email:id===ADMIN?'test-admin@example.invalid':'test-owner@example.invalid'}}
