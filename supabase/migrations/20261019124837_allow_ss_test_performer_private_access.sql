-- Narrow production authorization fix for the verified s.s fan and Test Performer.
--
-- This keeps the existing organizer navigator workflow intact while allowing only
-- the verified s.s Auth UUID to read the assigned Test Performer schedule,
-- performer/MAP row, and LIVE session. Write policies remain organizer-only.
begin;

set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = '1c21f421-5561-4213-8759-962873accfa0'::uuid
      and lower(u.email) = 'eventnowjapan@gmail.com'
      and u.email_confirmed_at is not null
      and p.display_name = 's.s'
      and p.role = 'fan'
      and p.status = 'active'
  ) then
    raise exception 'Verified s.s Auth identity did not match; rolling back.';
  end if;

  if not exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    join public.performers performer on performer.id = u.id
    where u.id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
      and u.email_confirmed_at is not null
      and p.role = 'performer'
      and p.status = 'active'
      and performer.stage_name = 'Test Performer'
      and performer.is_approved is true
      and performer.is_private_test is true
  ) then
    raise exception 'Verified Test Performer Auth identity did not match; rolling back.';
  end if;

  if not exists (
    select 1
    from public.live_navigator_assignments a
    where a.navigator_id = '1c21f421-5561-4213-8759-962873accfa0'::uuid
      and a.performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
      and a.active is true
  ) then
    raise exception 'Required active s.s to Test Performer assignment is missing; rolling back.';
  end if;
end
$$;

create or replace function public.can_navigate_live(target_performer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.live_navigator_assignments a
    join public.profiles navigator on navigator.id = a.navigator_id
    join public.performers performer on performer.id = a.performer_id
    where a.navigator_id = auth.uid()
      and a.performer_id = target_performer_id
      and a.active is true
      and navigator.status = 'active'
      and performer.is_approved is true
      and (
        navigator.role = 'organizer'
        or (
          navigator.role = 'fan'
          and a.navigator_id = '1c21f421-5561-4213-8759-962873accfa0'::uuid
          and a.performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
          and performer.is_private_test is true
        )
      )
  );
$$;

revoke all on function public.can_navigate_live(uuid) from public, anon;
grant execute on function public.can_navigate_live(uuid) to authenticated;

-- can_navigate_live() is also used by legacy write policies. Keep those writes
-- organizer-only so the s.s fan exception cannot control the performer or room.
alter policy performers_navigator_update
  on public.performers
  to authenticated
  using (
    public.can_navigate_live(id)
    and exists (
      select 1
      from public.profiles navigator
      where navigator.id = auth.uid()
        and navigator.role = 'organizer'
        and navigator.status = 'active'
    )
  )
  with check (
    public.can_navigate_live(id)
    and exists (
      select 1
      from public.profiles navigator
      where navigator.id = auth.uid()
        and navigator.role = 'organizer'
        and navigator.status = 'active'
    )
  );

alter policy live_sessions_navigator_write
  on public.live_sessions
  to authenticated
  using (
    public.can_navigate_live(performer_id)
    and exists (
      select 1
      from public.profiles navigator
      where navigator.id = auth.uid()
        and navigator.role = 'organizer'
        and navigator.status = 'active'
    )
  )
  with check (
    public.can_navigate_live(performer_id)
    and exists (
      select 1
      from public.profiles navigator
      where navigator.id = auth.uid()
        and navigator.role = 'organizer'
        and navigator.status = 'active'
    )
  );

-- Keep the anonymous public schedule path free of SECURITY DEFINER calls.
-- Assigned private schedules use the authenticated-only policy below.
alter policy live_schedules_public_read
  on public.live_schedules
  to anon, authenticated
  using (
    performer_id = (select auth.uid())
    or public.is_admin()
    or (
      status = 'scheduled'
      and exists (
        select 1
        from public.performers performer
        where performer.id = live_schedules.performer_id
          and performer.is_approved is true
          and performer.is_private_test is false
      )
    )
  );

drop policy if exists live_schedules_assigned_private_read on public.live_schedules;
create policy live_schedules_assigned_private_read
  on public.live_schedules
  for select
  to authenticated
  using (public.can_navigate_live(performer_id));

drop policy if exists performers_ss_test_performer_read on public.performers;
create policy performers_ss_test_performer_read
  on public.performers
  for select
  to authenticated
  using (
    id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
    and auth.uid() = '1c21f421-5561-4213-8759-962873accfa0'::uuid
    and public.can_navigate_live(id)
  );

drop policy if exists live_sessions_ss_test_performer_read on public.live_sessions;
create policy live_sessions_ss_test_performer_read
  on public.live_sessions
  for select
  to authenticated
  using (
    performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
    and auth.uid() = '1c21f421-5561-4213-8759-962873accfa0'::uuid
    and public.can_navigate_live(performer_id)
  );

commit;
