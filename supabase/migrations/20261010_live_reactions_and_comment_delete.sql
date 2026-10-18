-- Additive HAKU LIVE reactions. Applying this migration to production requires
-- a separate production-DB approval.
create table if not exists public.live_reaction_totals (
  performer_id uuid primary key references public.performers (id) on delete cascade,
  total bigint not null default 0 check (total >= 0),
  updated_at timestamptz not null default now()
);

alter table public.live_reaction_totals enable row level security;
drop policy if exists live_reaction_totals_read on public.live_reaction_totals;
create policy live_reaction_totals_read on public.live_reaction_totals for select using (true);
grant select on public.live_reaction_totals to anon, authenticated;

create table if not exists public.live_reaction_actor_windows (
  performer_id uuid not null references public.performers (id) on delete cascade,
  actor_key uuid not null,
  window_started_at timestamptz not null default now(),
  window_count integer not null default 0,
  primary key (performer_id, actor_key)
);
alter table public.live_reaction_actor_windows enable row level security;

create or replace function public.add_live_reactions(
  target_performer_id uuid,
  actor_key uuid,
  reaction_count integer
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_total bigint;
declare actor_window public.live_reaction_actor_windows%rowtype;
begin
  if actor_key is null or reaction_count < 1 or reaction_count > 30 then
    raise exception 'invalid reaction batch';
  end if;
  if not exists (
    select 1 from public.performers
    where id = target_performer_id and is_approved = true and is_live = true
  ) then
    raise exception 'live is not active';
  end if;
  insert into public.live_reaction_actor_windows (performer_id, actor_key, window_count)
  values (target_performer_id, actor_key, reaction_count)
  on conflict (performer_id, actor_key) do update set
    window_started_at = case when live_reaction_actor_windows.window_started_at < now() - interval '1 second' then now() else live_reaction_actor_windows.window_started_at end,
    window_count = case when live_reaction_actor_windows.window_started_at < now() - interval '1 second' then excluded.window_count else live_reaction_actor_windows.window_count + excluded.window_count end
  returning * into actor_window;
  if actor_window.window_count > 60 then
    raise exception 'reaction rate exceeded';
  end if;
  insert into public.live_reaction_totals (performer_id, total)
  values (target_performer_id, reaction_count)
  on conflict (performer_id) do update
    set total = live_reaction_totals.total + excluded.total, updated_at = now()
  returning total into new_total;
  return new_total;
end;
$$;
revoke all on function public.add_live_reactions(uuid, uuid, integer) from public;
grant execute on function public.add_live_reactions(uuid, uuid, integer) to anon, authenticated;

-- Authors can remove their own comments. Moderation remains server/admin-only.
drop policy if exists live_comments_delete_own on public.live_comments;
create policy live_comments_delete_own on public.live_comments
  for delete using (auth.uid() = user_id);
grant delete on public.live_comments to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.live_reaction_totals;
  exception when duplicate_object then null;
  end;
end $$;
