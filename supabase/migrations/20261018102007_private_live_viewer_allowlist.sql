-- Session-scoped access for the verified s.s fan to Test Performer LIVE.
-- This migration is intentionally not applied by the implementation PR.
begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1 from auth.users u
    join public.profiles p on p.id = u.id
    join public.performers pf on pf.id = u.id
    where u.id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
      and lower(u.email) = 'eb.shimada409@gmail.com'
      and u.email_confirmed_at is not null
      and p.role = 'performer' and p.status = 'active'
      and pf.stage_name = 'Test Performer' and pf.is_private_test is true
  ) then
    raise exception 'Verified Test Performer Auth identity did not match; rolling back.';
  end if;
  if not exists (
    select 1 from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = '1c21f421-5561-4213-8759-962873accfa0'::uuid
      and lower(u.email) = 'eventnowjapan@gmail.com'
      and u.email_confirmed_at is not null
      and p.display_name = 's.s' and p.role = 'fan' and p.status = 'active'
  ) then
    raise exception 'Verified s.s Auth identity did not match; rolling back.';
  end if;
end $$;

create table public.live_session_viewer_allowlist (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  viewer_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, viewer_user_id)
);

alter table public.live_session_viewer_allowlist enable row level security;
revoke all on table public.live_session_viewer_allowlist from public, anon, authenticated;
grant select, insert, delete on table public.live_session_viewer_allowlist to service_role;

create index live_session_viewer_allowlist_viewer_idx
  on public.live_session_viewer_allowlist(viewer_user_id, session_id);

create or replace function public.can_view_live_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.live_sessions ls
    join public.performers pf on pf.id = ls.performer_id
    where ls.id = target_session_id
      and (
        (pf.is_approved is true and pf.is_private_test is false)
        or pf.id = auth.uid()
        or public.is_admin()
        or (
          ls.ended_at is null
          and auth.uid() is not null
          and exists (
            select 1 from public.live_session_viewer_allowlist a
            join public.profiles viewer on viewer.id = a.viewer_user_id
            where a.session_id = ls.id
              and a.viewer_user_id = auth.uid()
              and viewer.role = 'fan' and viewer.status = 'active'
          )
        )
      )
  );
$$;

create or replace function public.can_view_live_performer(target_performer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.performers pf
    where pf.id = target_performer_id
      and (
        (pf.is_approved is true and pf.is_private_test is false)
        or pf.id = auth.uid()
        or public.is_admin()
        or exists (
          select 1 from public.live_sessions ls
          join public.live_session_viewer_allowlist a on a.session_id = ls.id
          join public.profiles viewer on viewer.id = a.viewer_user_id
          where ls.performer_id = pf.id and ls.ended_at is null
            and a.viewer_user_id = auth.uid()
            and viewer.role = 'fan' and viewer.status = 'active'
        )
      )
  );
$$;

revoke all on function public.can_view_live_session(uuid) from public;
revoke all on function public.can_view_live_performer(uuid) from public;
grant execute on function public.can_view_live_session(uuid) to anon, authenticated;
grant execute on function public.can_view_live_performer(uuid) to anon, authenticated;

create or replace function public.seed_test_performer_live_viewer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid then
    insert into public.live_session_viewer_allowlist(session_id, viewer_user_id)
    values (new.id, '1c21f421-5561-4213-8759-962873accfa0'::uuid)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.seed_test_performer_live_viewer() from public, anon, authenticated;

create trigger live_sessions_seed_test_viewer
  after insert on public.live_sessions
  for each row execute function public.seed_test_performer_live_viewer();

insert into public.live_session_viewer_allowlist(session_id, viewer_user_id)
select ls.id, '1c21f421-5561-4213-8759-962873accfa0'::uuid
from public.live_sessions ls
where ls.performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
  and ls.ended_at is null
on conflict do nothing;

alter policy performers_public_read on public.performers
  using (public.can_view_live_performer(id));

alter policy live_sessions_read on public.live_sessions
  using (public.can_view_live_session(id));

drop policy if exists live_comments_read on public.live_comments;
create policy live_comments_read on public.live_comments for select using (
  case when live_session_id is null
    then public.can_view_live_performer(performer_id)
    else public.can_view_live_session(live_session_id)
  end
);
drop policy if exists live_comments_insert on public.live_comments;
create policy live_comments_insert on public.live_comments for insert to authenticated with check (
  auth.uid() = user_id
  and case when live_session_id is null
    then public.can_view_live_performer(performer_id)
    else public.can_view_live_session(live_session_id)
  end
);

drop policy if exists live_tip_events_read on public.live_tip_events;
create policy live_tip_events_read on public.live_tip_events for select using (
  case when live_session_id is null
    then public.can_view_live_performer(performer_id)
    else public.can_view_live_session(live_session_id)
  end
);

drop policy if exists live_reaction_totals_read on public.live_reaction_totals;
create policy live_reaction_totals_read on public.live_reaction_totals for select using (
  public.can_view_live_performer(performer_id)
);

-- Both reaction RPCs are SECURITY DEFINER, so they need an explicit privacy check.
create or replace function public.add_live_reactions(target_performer_id uuid, actor_key uuid, reaction_count integer)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_total bigint; actor_window public.live_reaction_actor_windows%rowtype; session_start timestamptz;
begin
  if not public.can_view_live_performer(target_performer_id) then raise exception 'live is not available' using errcode = '42501'; end if;
  if actor_key is null or reaction_count is null or reaction_count < 1 or reaction_count > 30 then raise exception 'invalid reaction batch'; end if;
  select live_started_at into session_start from public.performers where id = target_performer_id and is_approved = true and is_live = true for share;
  if not found or session_start is null then raise exception 'live is not active'; end if;
  insert into public.live_reaction_actor_windows(performer_id, actor_key, window_count)
  values(target_performer_id, actor_key, reaction_count)
  on conflict on constraint live_reaction_actor_windows_pkey do update set
    window_started_at = case when live_reaction_actor_windows.window_started_at < now() - interval '1 second' then now() else live_reaction_actor_windows.window_started_at end,
    window_count = case when live_reaction_actor_windows.window_started_at < now() - interval '1 second' then excluded.window_count else live_reaction_actor_windows.window_count + excluded.window_count end
  returning * into actor_window;
  if actor_window.window_count > 60 then raise exception 'reaction rate exceeded'; end if;
  insert into public.live_reaction_totals(performer_id, total, live_started_at) values(target_performer_id, reaction_count, session_start)
  on conflict(performer_id) do update set total = case when live_reaction_totals.live_started_at = excluded.live_started_at then live_reaction_totals.total + excluded.total else excluded.total end,
    live_started_at = excluded.live_started_at, updated_at = now()
  returning total into new_total;
  return new_total;
end;
$$;

create or replace function public.add_live_session_reactions(target_performer_id uuid, actor_key uuid, reaction_count integer, expected_started_at timestamptz)
returns bigint language plpgsql security definer set search_path = public as $$
declare session_start timestamptz;
begin
  if not public.can_view_live_performer(target_performer_id) then raise exception 'live is not available' using errcode = '42501'; end if;
  select live_started_at into session_start from public.performers where id = target_performer_id and is_approved = true and is_live = true for share;
  if not found or expected_started_at is null or session_start is distinct from expected_started_at then raise exception 'live session changed'; end if;
  return public.add_live_reactions(target_performer_id, actor_key, reaction_count);
end;
$$;

-- Defense in depth: direct RPC calls cannot create notifications for private LIVE.
create or replace function public.notify_followers_live_start(p_performer_id uuid, p_stage_name text, p_title text default null)
returns void language plpgsql security definer set search_path = public as $$
declare body_text text;
begin
  if auth.uid() is null or auth.uid() <> p_performer_id then raise exception 'not allowed'; end if;
  if exists (select 1 from public.performers where id = p_performer_id and is_private_test is true) then return; end if;
  if p_title is not null and btrim(p_title) <> '' then
    body_text := coalesce(nullif(btrim(p_stage_name), ''), 'パフォーマー') || ' が「' || btrim(p_title) || '」を配信開始しました';
  else body_text := coalesce(nullif(btrim(p_stage_name), ''), 'パフォーマー') || ' がライブ配信を開始しました'; end if;
  insert into public.notifications(user_id, title, body, link)
  select distinct f.fan_id, 'LIVE開始', body_text, 'live:' || p_performer_id::text from public.follows f where f.performer_id = p_performer_id;
end;
$$;
revoke all on function public.notify_followers_live_start(uuid, text, text) from public, anon;
grant execute on function public.notify_followers_live_start(uuid, text, text) to authenticated;

commit;
