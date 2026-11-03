import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseYouTubeLiveReference } from '../src/platform/lib/youtubeLive'
const original = readFileSync('supabase/migrations/20261023110000_youtube_live_companion.sql', 'utf8')
const repair = readFileSync('supabase/migrations/20261031042340_fix_youtube_live_url_constraint.sql', 'utf8')
// This policy matches pg_policies inspected read-only on Production.
const security = readFileSync('supabase/migrations/20260726_platform_beta.sql', 'utf8')
const owner = '10000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const ref = parseYouTubeLiveReference('https://youtube.com/live/yk6Kjl0WHWs?si=share')!
describe('YouTube LIVE real PostgreSQL constraint and RLS regression', () => {
  const db = new PGlite()
  beforeAll(async () => {
    await db.exec(`create schema auth;
      create role authenticated; create role anon;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      create table profiles(id uuid primary key,status text);
      insert into profiles values ('${owner}','active'),('${other}','active');
      grant select on profiles to authenticated,anon;
      create table performers (id uuid primary key, is_approved boolean default true, updated_at timestamptz default now(), is_live boolean default false, live_title text, share_location boolean default false);
      insert into performers(id) values ('${owner}'), ('${other}');`)
    await db.exec(original)
  }, 30000)
  afterAll(async () => { await db.close() })
  it('reproduces Production failure with the reported video ID and SQLSTATE 23514', async () => {
    await expect(db.query('update performers set youtube_live_url=$1, youtube_live_video_id=$2, youtube_live_enabled=true where id=$3', [ref.canonicalUrl, ref.videoId, owner])).rejects.toMatchObject({ code: '23514', constraint: 'performers_youtube_live_url_check' })
  })
  it('repairs existing installations and allows register/publish/off/republish/unlink repeatedly', async () => {
    await db.exec(repair); await db.exec(repair)
    await db.query('update performers set youtube_live_url=$1, youtube_live_video_id=$2 where id=$3', [ref.canonicalUrl, ref.videoId, owner])
    for (const enabled of [true, false, true]) {
      const result = await db.query<{youtube_live_enabled: boolean}>('update performers set youtube_live_enabled=$1 where id=$2 returning youtube_live_enabled', [enabled, owner])
      expect(result.rows[0].youtube_live_enabled).toBe(enabled)
    }
    await db.query('update performers set youtube_live_url=null,youtube_live_video_id=null,youtube_live_enabled=false where id=$1', [owner])
    await db.query('update performers set youtube_live_url=$1,youtube_live_video_id=$2,youtube_live_enabled=true where id=$3', [ref.canonicalUrl, ref.videoId, owner])
    expect((await db.query('select is_live,live_title,share_location from performers where id=$1', [owner])).rows).toEqual([{is_live:false,live_title:null,share_location:false}])
  })
  it.each(['https://evil.example/watch?v=yk6Kjl0WHWs', 'https://www.youtube.com/watch?v=short', 'https://wwwXyoutubeXcom/watch?v=yk6Kjl0WHWs', 'https://www.youtube.com/watch?v=yk6Kjl0WHWs&extra=1'])('rejects noncanonical URL %s', async url => {
    await expect(db.query('update performers set youtube_live_url=$1 where id=$2', [url, owner])).rejects.toMatchObject({ code: '23514' })
  })
  it('retains deployed owner RLS against another performer and anonymous requests', async () => {
    const ownerPolicy = security.match(/create policy performers_update_own on public\.performers[\s\S]*?;/)![0]
    await db.exec(`alter table performers enable row level security;
      grant usage on schema public,auth to authenticated,anon;
      grant select,update on performers to authenticated,anon;
      create policy performers_read on performers for select using(true);
      ${ownerPolicy}
      set role authenticated;
      select set_config('request.jwt.claim.sub','${other}',false);`)
    expect((await db.query('update performers set youtube_live_enabled=false where id=$1 returning id', [owner])).rows).toHaveLength(0)
    expect((await db.query('update performers set youtube_live_enabled=false where id=$1 returning id', [other])).rows).toHaveLength(1)
    await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false);")
    expect((await db.query('update performers set youtube_live_enabled=false where id=$1 returning id', [owner])).rows).toHaveLength(0)
    await db.exec('reset role')
  })
  it('blocks YouTube changes through delegated navigator RLS while retaining DIRECT updates', async () => {
    await db.exec(`create policy navigator_fixture on performers for update using(true) with check(true);
      set role authenticated; select set_config('request.jwt.claim.sub','${other}',false);`)
    await expect(db.query('update performers set youtube_live_enabled=false where id=$1', [owner])).rejects.toMatchObject({code:'42501'})
    expect((await db.query('update performers set live_title=$1 where id=$2 returning id', ['delegated DIRECT title',owner])).rows).toHaveLength(1)
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`)
    expect((await db.query('update performers set youtube_live_enabled=false where id=$1 returning id', [owner])).rows).toHaveLength(1)
    await db.exec('reset role')
  })

})
