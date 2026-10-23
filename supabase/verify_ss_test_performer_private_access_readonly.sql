-- Read-only production verification for:
--   s.s fan:        1c21f421-5561-4213-8759-962873accfa0
--   Test Performer: 29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1
--
-- Run only after 20261019124837_allow_ss_test_performer_private_access.sql.
-- Every actor check is isolated in a READ ONLY transaction and rolled back.

-- 1. Persistent configuration and exact assignment invariants.
select
  (select count(*)
   from public.live_navigator_assignments a
   where a.navigator_id = '1c21f421-5561-4213-8759-962873accfa0'::uuid
     and a.performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
     and a.active is true) as expected_active_assignment_count,
  (select count(*)
   from public.live_navigator_assignments a
   where a.performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
     and a.active is true
     and a.navigator_id <> '1c21f421-5561-4213-8759-962873accfa0'::uuid)
    as unexpected_active_assignment_count;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in (
    'performers_ss_test_performer_read',
    'live_schedules_assigned_private_read',
    'live_sessions_ss_test_performer_read',
    'performers_navigator_update',
    'live_sessions_navigator_write'
  )
order by tablename, policyname;

select
  has_function_privilege('anon', 'public.can_navigate_live(uuid)', 'execute')
    as anon_can_execute_can_navigate,
  has_function_privilege('authenticated', 'public.can_navigate_live(uuid)', 'execute')
    as authenticated_can_execute_can_navigate;

-- 2. s.s: must see the assigned private performer and scheduled LIVE.
begin read only;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '1c21f421-5561-4213-8759-962873accfa0',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;
select
  public.can_navigate_live('29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as can_navigate,
  (select count(*)
   from public.performers
   where id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as performer_map_rows_visible,
  (select count(*)
   from public.live_schedules
   where performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
     and status = 'scheduled')
    as scheduled_live_rows_visible,
  (select count(*)
   from public.live_sessions
   where performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
     and ended_at is null)
    as open_live_rows_visible;
rollback;

-- 3. Unassigned active fan: all Test Performer private rows must remain hidden.
begin read only;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '36ff70ed-c08a-440a-84f8-d3051bec9f68',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;
select
  public.can_navigate_live('29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as can_navigate,
  (select count(*)
   from public.performers
   where id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as performer_map_rows_visible,
  (select count(*)
   from public.live_schedules
   where performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as live_schedule_rows_visible,
  (select count(*)
   from public.live_sessions
   where performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as live_session_rows_visible;
rollback;

-- 4. Anonymous: performer, MAP, schedule, and session rows must remain hidden.
begin read only;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon')::text,
  true
);
set local role anon;
select
  (select count(*)
   from public.performers
   where id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as performer_map_rows_visible,
  (select count(*)
   from public.live_schedules
   where performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as live_schedule_rows_visible,
  (select count(*)
   from public.live_sessions
   where performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid)
    as live_session_rows_visible;
rollback;
