-- NOT APPLIED. Review/test separately; never apply during an active production LIVE.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create schema if not exists haku_live_internal;
revoke all on schema haku_live_internal from public, anon, authenticated;

create table public.live_like_totals (
  performer_id uuid not null references public.performers(id),
  live_started_at timestamptz not null,
  total bigint not null default 0 check(total >= 0),
  primary key(performer_id, live_started_at)
);
alter table public.live_like_totals enable row level security;
revoke all on public.live_like_totals from public, anon, authenticated;
grant select on public.live_like_totals to anon, authenticated;
create policy live_like_totals_read on public.live_like_totals for select to anon, authenticated
using (exists(select 1 from public.performers p where p.id = performer_id
  and ((p.is_approved and not p.is_private_test) or p.id = (select auth.uid()))));

create table haku_live_internal.like_batches (
  performer_id uuid not null,
  live_started_at timestamptz not null,
  user_id uuid not null,
  batch_id uuid not null,
  count integer not null check(count between 1 and 12),
  primary key(performer_id, live_started_at, user_id, batch_id)
);
create table haku_live_internal.like_windows (
  performer_id uuid not null,
  live_started_at timestamptz not null,
  user_id uuid not null,
  window_start timestamptz not null,
  count integer not null,
  primary key(performer_id, live_started_at, user_id)
);
alter table haku_live_internal.like_batches enable row level security;
alter table haku_live_internal.like_windows enable row level security;
revoke all on all tables in schema haku_live_internal from public, anon, authenticated;

-- No actor ID argument: caller identity always comes from the verified JWT.
create function public.record_live_likes(target_performer_id uuid, expected_started_at timestamptz, batch_id uuid, like_count integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  old_count integer;
  window_count integer;
  result bigint;
  tick timestamptz := clock_timestamp();
begin
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    or not exists(select 1 from public.profiles where id = actor and status = 'active') then
    raise exception 'login required' using errcode = '42501';
  end if;
  if batch_id is null or expected_started_at is null or like_count is null or like_count < 1 or like_count > 12 then
    raise exception 'invalid batch' using errcode = '22023';
  end if;
  -- Same lock order as lifecycle writers: performer before counters. No changes to the session.
  perform 1 from public.performers p where p.id = target_performer_id and p.is_live and p.is_approved
    and not p.is_private_test and p.live_started_at = expected_started_at for share;
  if not found then raise exception 'live session ended or changed' using errcode = '55000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_performer_id::text || ':' || expected_started_at::text || ':' || actor::text, 0));
  select b.count into old_count from haku_live_internal.like_batches b
    where b.performer_id = target_performer_id and b.live_started_at = expected_started_at and b.user_id = actor and b.batch_id = record_live_likes.batch_id;
  if found then
    if old_count <> like_count then raise exception 'batch payload changed' using errcode = '22023'; end if;
    select total into result from public.live_like_totals where performer_id = target_performer_id and live_started_at = expected_started_at;
    return result;
  end if;
  insert into haku_live_internal.like_windows as w values(target_performer_id, expected_started_at, actor, tick, like_count)
  on conflict(performer_id, live_started_at, user_id) do update set
    count = case when w.window_start <= tick - interval '1 second' then excluded.count else w.count + excluded.count end,
    window_start = case when w.window_start <= tick - interval '1 second' then tick else w.window_start end
  returning count into window_count;
  if window_count > 12 then raise exception 'like rate exceeded' using errcode = '54000'; end if;
  insert into haku_live_internal.like_batches values(target_performer_id, expected_started_at, actor, batch_id, like_count);
  insert into public.live_like_totals as t values(target_performer_id, expected_started_at, like_count)
    on conflict(performer_id, live_started_at) do update set total = t.total + excluded.total
    returning total into result;
  return result;
end;
$$;
revoke all on function public.record_live_likes(uuid,timestamptz,uuid,integer) from public, anon;
grant execute on function public.record_live_likes(uuid,timestamptz,uuid,integer) to authenticated;
-- Polling remains available when publication is not configured.
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_like_totals;
  end if;
end $$;
commit;
