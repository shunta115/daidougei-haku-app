-- LIVE-only: preserve active totals, reset on a new LIVE, and bound comment spam.
begin;
set local lock_timeout = '3s';
create schema if not exists haku_live_backup_20261011;
create table if not exists haku_live_backup_20261011.reaction_totals as table public.live_reaction_totals;
create table if not exists haku_live_backup_20261011.reaction_actor_windows as table public.live_reaction_actor_windows;
create table if not exists haku_live_backup_20261011.function_definitions as
  select oid::regprocedure::text as signature, pg_get_functiondef(oid) as definition
  from pg_proc where pronamespace = 'public'::regnamespace and proname = 'add_live_reactions';

alter table public.live_reaction_totals add column if not exists live_started_at timestamptz;
update public.live_reaction_totals totals set live_started_at = performer.live_started_at
from public.performers performer where performer.id = totals.performer_id and totals.live_started_at is null;

create or replace function public.reset_live_reaction_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_live and new.live_started_at is not null and new.live_started_at is distinct from old.live_started_at then
    insert into public.live_reaction_totals(performer_id, total, live_started_at, updated_at)
    values(new.id, 0, new.live_started_at, now())
    on conflict(performer_id) do update set total = 0, live_started_at = excluded.live_started_at, updated_at = now();
  end if;
  return new;
end;
$$;
create trigger performers_reset_live_reactions after update of live_started_at on public.performers
for each row execute function public.reset_live_reaction_session();

create or replace function public.add_live_reactions(target_performer_id uuid, actor_key uuid, reaction_count integer)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_total bigint; actor_window public.live_reaction_actor_windows%rowtype; session_start timestamptz;
begin
  if actor_key is null or reaction_count is null or reaction_count < 1 or reaction_count > 30 then
    raise exception 'invalid reaction batch';
  end if;
  select live_started_at into session_start from public.performers
  where id = target_performer_id and is_approved = true and is_live = true for share;
  if not found or session_start is null then raise exception 'live is not active'; end if;
  insert into public.live_reaction_actor_windows(performer_id, actor_key, window_count)
  values(target_performer_id, actor_key, reaction_count)
  on conflict on constraint live_reaction_actor_windows_pkey do update set
    window_started_at = case when live_reaction_actor_windows.window_started_at < now() - interval '1 second' then now() else live_reaction_actor_windows.window_started_at end,
    window_count = case when live_reaction_actor_windows.window_started_at < now() - interval '1 second' then excluded.window_count else live_reaction_actor_windows.window_count + excluded.window_count end
  returning * into actor_window;
  if actor_window.window_count > 60 then raise exception 'reaction rate exceeded'; end if;
  insert into public.live_reaction_totals(performer_id, total, live_started_at) values(target_performer_id, reaction_count, session_start)
  on conflict(performer_id) do update set
    total = case when live_reaction_totals.live_started_at = excluded.live_started_at then live_reaction_totals.total + excluded.total else excluded.total end,
    live_started_at = excluded.live_started_at, updated_at = now()
  returning total into new_total;
  return new_total;
end;
$$;

-- Anonymous access matches the existing anonymous reaction RPC; no new data is exposed.
create function public.add_live_session_reactions(target_performer_id uuid, actor_key uuid, reaction_count integer, expected_started_at timestamptz)
returns bigint language plpgsql security definer set search_path = public as $$
declare session_start timestamptz;
begin
  select live_started_at into session_start from public.performers
  where id = target_performer_id and is_approved = true and is_live = true for share;
  if not found or expected_started_at is null or session_start is distinct from expected_started_at then
    raise exception 'live session changed';
  end if;
  return public.add_live_reactions(target_performer_id, actor_key, reaction_count);
end;
$$;

revoke all on function public.add_live_session_reactions(uuid, uuid, integer, timestamptz) from public;
grant execute on function public.add_live_session_reactions(uuid, uuid, integer, timestamptz) to anon, authenticated;

create index if not exists live_comments_user_created_idx on public.live_comments(user_id, created_at);
create function public.limit_live_comment_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Server-verified gift chat lines use service_role and must remain unaffected.
  if auth.uid() is not null then
    if auth.uid() <> new.user_id then raise exception 'comment author mismatch'; end if;
    perform pg_advisory_xact_lock(hashtextextended('live-comment:' || new.user_id::text, 0));
    if (select count(*) from public.live_comments where user_id = new.user_id and created_at > now() - interval '10 seconds') >= 5 then
      raise exception 'コメントの送信が多すぎます。少し待ってからお試しください。';
    end if;
  end if;
  return new;
end;
$$;
create trigger live_comments_rate_limit before insert on public.live_comments
for each row execute function public.limit_live_comment_rate();
commit;
