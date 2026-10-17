import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261016142951_live_comment_moderation.sql', 'utf8')
const performer = '10000000-0000-4000-8000-000000000001'
const moderator = '20000000-0000-4000-8000-000000000002'
const fan = '30000000-0000-4000-8000-000000000003'
const stranger = '40000000-0000-4000-8000-000000000004'
const session = '50000000-0000-4000-8000-000000000005'
const otherSession = '60000000-0000-4000-8000-000000000006'

describe('LIVE comment moderation migration', () => {
  const db = new PGlite()

  const asUser = async <T = unknown>(userId: string, sql: string) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
    try {
      return await db.query<T>(sql)
    } finally {
      await db.exec('reset role')
    }
  }

  beforeAll(async () => {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      grant usage on schema public, auth to authenticated;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      grant execute on function auth.uid() to authenticated;
      grant execute on function public.is_admin() to authenticated;

      create table public.profiles (id uuid primary key);
      create table public.performers (id uuid primary key references public.profiles(id));
      create table public.live_sessions (
        id uuid primary key,
        performer_id uuid not null references public.performers(id),
        ended_at timestamptz
      );
      create table public.live_comments (
        id uuid primary key default gen_random_uuid(),
        performer_id uuid not null references public.performers(id),
        live_session_id uuid references public.live_sessions(id) on delete set null,
        user_id uuid not null references public.profiles(id),
        display_name text not null,
        body text not null,
        created_at timestamptz not null default now()
      );
      alter table public.live_sessions enable row level security;
      alter table public.live_comments enable row level security;
      create policy live_sessions_read on public.live_sessions for select using (true);
      create policy live_comments_read on public.live_comments for select using (true);
      create policy live_comments_insert on public.live_comments for insert with check (auth.uid() = user_id);
      grant select on public.live_sessions to authenticated;
      grant select, insert on public.live_comments to authenticated;

      insert into public.profiles(id) values ('${performer}'), ('${moderator}'), ('${fan}'), ('${stranger}');
      insert into public.performers(id) values ('${performer}');
      insert into public.live_sessions(id, performer_id) values ('${session}', '${performer}');
      insert into public.live_sessions(id, performer_id, ended_at) values ('${otherSession}', '${performer}', now());
    `)
    await db.exec(migration)
    await db.exec(migration)
  }, 30_000)

  afterAll(async () => { await db.close() })

  it('lets only the performer grant a session moderator', async () => {
    await expect(asUser(stranger, `insert into public.live_comment_moderators values ('${session}', '${moderator}', '${stranger}')`)).rejects.toThrow()
    await expect(asUser(performer, `insert into public.live_comment_moderators values ('${session}', '${moderator}', '${performer}')`)).resolves.toBeDefined()
  })

  it('accepts comments only for the matching active session', async () => {
    await expect(asUser(fan, `insert into public.live_comments(performer_id,live_session_id,user_id,display_name,body) values ('${performer}','${session}','${fan}','Fan','active')`)).resolves.toBeDefined()
    await expect(asUser(fan, `insert into public.live_comments(performer_id,live_session_id,user_id,display_name,body) values ('${performer}','${otherSession}','${fan}','Fan','ended')`)).rejects.toThrow()
  })

  it('lets a moderator delete and mute without giving unrelated users that authority', async () => {
    const comment = await db.query<{ id: string }>(`select id from public.live_comments where body='active'`)
    await expect(asUser(stranger, `delete from public.live_comments where id='${comment.rows[0].id}'`)).resolves.toMatchObject({ affectedRows: 0 })
    await expect(asUser(stranger, `insert into public.live_comment_mutes values ('${session}', '${fan}', '${stranger}', null)`)).rejects.toThrow()
    await expect(asUser(moderator, `insert into public.live_comment_mutes values ('${session}', '${fan}', '${moderator}', null)`)).resolves.toBeDefined()
    await expect(asUser(moderator, `delete from public.live_comments where id='${comment.rows[0].id}'`)).resolves.toMatchObject({ affectedRows: 1 })
  })

  it('blocks a muted user only in the muted LIVE session', async () => {
    await expect(asUser(fan, `insert into public.live_comments(performer_id,live_session_id,user_id,display_name,body) values ('${performer}','${session}','${fan}','Fan','blocked')`)).rejects.toThrow()
  })
})
