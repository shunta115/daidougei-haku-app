-- Initial LIVE reservations and audience time-series.
-- Additive only: no existing rows are updated or deleted.

create table if not exists public.live_schedules (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  scheduled_start_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'started', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_schedules_public_idx
  on public.live_schedules (status, scheduled_start_at)
  where status = 'scheduled';
create index if not exists live_schedules_performer_idx
  on public.live_schedules (performer_id, scheduled_start_at desc);

create table if not exists public.live_reservations (
  live_schedule_id uuid not null references public.live_schedules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (live_schedule_id, user_id)
);
create index if not exists live_reservations_user_idx
  on public.live_reservations (user_id, created_at desc);

create table if not exists public.live_viewer_samples (
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  sampled_at timestamptz not null default now(),
  viewer_count integer not null check (viewer_count >= 0),
  primary key (live_session_id, sampled_at)
);
create index if not exists live_viewer_samples_session_idx
  on public.live_viewer_samples (live_session_id, sampled_at desc);

alter table public.live_schedules enable row level security;
alter table public.live_schedules force row level security;
alter table public.live_reservations enable row level security;
alter table public.live_reservations force row level security;
alter table public.live_viewer_samples enable row level security;
alter table public.live_viewer_samples force row level security;

revoke all on table public.live_schedules from anon, authenticated;
revoke all on table public.live_reservations from anon, authenticated;
revoke all on table public.live_viewer_samples from anon, authenticated;
grant select on table public.live_schedules to anon, authenticated;
grant insert, update, delete on table public.live_schedules to authenticated;
grant select, insert, delete on table public.live_reservations to authenticated;
grant select on table public.live_viewer_samples to authenticated;

drop policy if exists live_schedules_public_read on public.live_schedules;
create policy live_schedules_public_read on public.live_schedules
  for select to anon, authenticated
  using (
    performer_id = (select auth.uid())
    or public.is_admin()
    or (
      status = 'scheduled'
      and exists (
        select 1
        from public.performers p
        where p.id = live_schedules.performer_id
          and p.is_approved = true
          and p.is_private_test = false
      )
    )
  );

drop policy if exists live_schedules_owner_insert on public.live_schedules;
create policy live_schedules_owner_insert on public.live_schedules
  for insert to authenticated
  with check (
    performer_id = (select auth.uid())
    and exists (
      select 1 from public.performers p
      join public.profiles pr on pr.id = p.id
      where p.id = (select auth.uid()) and p.is_approved and pr.status = 'active'
    )
  );

drop policy if exists live_schedules_owner_update on public.live_schedules;
create policy live_schedules_owner_update on public.live_schedules
  for update to authenticated
  using (performer_id = (select auth.uid()) or public.is_admin())
  with check (performer_id = (select auth.uid()) or public.is_admin());

drop policy if exists live_schedules_owner_delete on public.live_schedules;
create policy live_schedules_owner_delete on public.live_schedules
  for delete to authenticated
  using (performer_id = (select auth.uid()) or public.is_admin());

drop policy if exists live_reservations_own_read on public.live_reservations;
create policy live_reservations_own_read on public.live_reservations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.live_schedules s
      where s.id = live_reservations.live_schedule_id
        and s.performer_id = (select auth.uid())
    )
    or public.is_admin()
  );

drop policy if exists live_reservations_own_insert on public.live_reservations;
create policy live_reservations_own_insert on public.live_reservations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.live_schedules s
      join public.performers p on p.id = s.performer_id
      where s.id = live_reservations.live_schedule_id
        and s.status = 'scheduled'
        and s.scheduled_start_at > now() - interval '15 minutes'
        and p.is_approved = true
        and p.is_private_test = false
    )
  );

drop policy if exists live_reservations_own_delete on public.live_reservations;
create policy live_reservations_own_delete on public.live_reservations
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists live_viewer_samples_owner_read on public.live_viewer_samples;
create policy live_viewer_samples_owner_read on public.live_viewer_samples
  for select to authenticated
  using (
    exists (
      select 1 from public.live_sessions s
      where s.id = live_viewer_samples.live_session_id
        and s.performer_id = (select auth.uid())
    )
    or public.is_admin()
  );

-- Runtime sample writes stay server-only. The service role bypasses RLS.
-- Reservation start notifications are deliberately in-app for this first release;
-- web push delivery remains a separately controlled worker concern.
create or replace function public.notify_live_reservations_started(
  p_schedule_id uuid,
  p_live_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.live_schedules%rowtype;
  v_count integer;
begin
  select * into v_schedule from public.live_schedules where id = p_schedule_id for update;
  if not found or v_schedule.performer_id <> (select auth.uid()) then
    raise exception 'not_allowed';
  end if;
  if not exists (
    select 1 from public.live_sessions s
    where s.id = p_live_session_id
      and s.performer_id = v_schedule.performer_id
      and s.ended_at is null
  ) then
    raise exception 'invalid_live_session';
  end if;

  update public.live_schedules
  set status = 'started', updated_at = now()
  where id = p_schedule_id and status = 'scheduled';

  insert into public.notifications (user_id, title, body, link, kind, meta)
  select r.user_id, '予約LIVEが始まりました', v_schedule.title,
    'live:' || v_schedule.performer_id::text,
    'live_reservation_started',
    jsonb_build_object('scheduleId', p_schedule_id, 'liveSessionId', p_live_session_id)
  from public.live_reservations r
  where r.live_schedule_id = p_schedule_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id
        and n.kind = 'live_reservation_started'
        and n.meta->>'scheduleId' = p_schedule_id::text
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_live_reservations_started(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify_live_reservations_started(uuid, uuid) to authenticated;
