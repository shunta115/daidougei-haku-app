-- Read-only verification after 20261018092439_live_reservations_and_viewer_analytics.sql.
-- Run with a role that can inspect catalogs. This file performs SELECT statements only.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('live_schedules', 'live_reservations', 'live_viewer_samples')
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('live_schedules', 'live_reservations', 'live_viewer_samples')
order by tablename, policyname;

-- Both rows must contain the is_private_test=false guard. A missing result or
-- false value is a release blocker because it can expose private test LIVE data.
select
  policyname,
  coalesce(qual, with_check) like '%is_private_test = false%' as blocks_private_test
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'live_schedules' and policyname = 'live_schedules_public_read')
    or (tablename = 'live_reservations' and policyname = 'live_reservations_own_insert')
  )
order by policyname;

-- Expected browser ACL:
-- anon: live_schedules SELECT only
-- authenticated: schedules SELECT/INSERT/UPDATE/DELETE;
--                reservations SELECT/INSERT/DELETE; viewer samples SELECT only
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in ('live_schedules', 'live_reservations', 'live_viewer_samples')
order by table_name, grantee, privilege_type;

-- Must return no rows: browser roles may never write analytics samples.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name = 'live_viewer_samples'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'notify_live_reservations_started';

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('live_schedules', 'live_reservations', 'live_viewer_samples')
order by tablename, indexname;

-- Baseline only. Applying this migration must not change existing LIVE, tip,
-- vote, or performer rows; record these counts before and after separately.
select
  (select count(*) from public.live_sessions) as live_session_count,
  (select count(*) from public.performers) as performer_count,
  (select count(*) from public.live_schedules) as live_schedule_count,
  (select count(*) from public.live_reservations) as live_reservation_count,
  (select count(*) from public.live_viewer_samples) as live_viewer_sample_count;
