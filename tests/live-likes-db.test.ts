import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
const db = new PGlite()
const p='10000000-0000-4000-8000-000000000001', a='10000000-0000-4000-8000-000000000002', b='10000000-0000-4000-8000-000000000003'
const epoch='2026-10-31T00:00:00Z'
const batch = (id:number) => `20000000-0000-4000-8000-${String(id).padStart(12,'0')}`
async function login(id:string) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'`) }
async function send(id:number,count=1,session=epoch) { return (await db.query<{total:string}>(`select record_live_likes('${p}','${session}','${batch(id)}',${count}) as total`)).rows[0].total }
beforeAll(async()=>{
 await db.exec(`create schema auth; create role anon; create role authenticated; grant usage on schema auth,public to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
 create table profiles(id uuid primary key,status text);
 create table performers(id uuid primary key,is_live boolean,is_approved boolean,is_private_test boolean,live_started_at timestamptz);
 grant select on performers to anon,authenticated;
 insert into profiles values('${a}','active'),('${b}','active');
 insert into performers values('${p}',true,true,false,'${epoch}');`)
 await db.exec(readFileSync('supabase/migrations/20261031030528_durable_live_likes.sql','utf8'))
},30000)
afterAll(async()=>{await db.close()})
it('aggregates multiple identities exactly once, including retry after a commit',async()=>{
 await login(a); expect(Number(await send(1,3))).toBe(3); expect(Number(await send(1,3))).toBe(3)
 await login(b); expect(Number(await send(1,2))).toBe(5)
 await expect(send(1,3)).rejects.toThrow(/payload changed/)
})
it('enforces server rate limits and denies direct table/internal writes',async()=>{
 await login(b); await send(2,10)
 await expect(send(3,1)).rejects.toThrow(/rate exceeded/)
 await expect(db.exec(`update live_like_totals set total=999`)).rejects.toThrow(/permission denied/)
 await expect(db.exec(`select * from haku_live_internal.like_batches`)).rejects.toThrow(/permission denied/)
})
it('rejects anonymous, inactive, private and stale-session writes, without modifying LIVE state',async()=>{
 await db.exec('reset role; set role anon'); await expect(send(4)).rejects.toThrow(/permission denied/)
 await db.exec(`reset role; update profiles set status='suspended' where id='${a}'`)
 await login(a); await expect(send(4)).rejects.toThrow(/login required/)
 await login(b); await expect(send(4,1,'2026-10-30T00:00:00Z')).rejects.toThrow(/ended or changed/)
 await db.exec('reset role; update performers set is_private_test=true')
 await login(b); await expect(send(4)).rejects.toThrow(/ended or changed/)
 expect((await db.query('select * from live_like_totals')).rows).toHaveLength(0)
 await db.exec('reset role; update performers set is_private_test=false,is_live=false')
 await login(b); await expect(send(1,2)).rejects.toThrow(/ended or changed/)
 await db.exec('reset role')
 const state=await db.query<{is_live:boolean,live_started_at:string}>('select is_live,live_started_at from performers')
 expect(state.rows[0].is_live).toBe(false)
})
