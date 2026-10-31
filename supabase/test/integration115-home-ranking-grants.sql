-- TEST-only missing server read privileges. No client grants, ownership or RLS changes.
-- Used by /api/home-ranking to aggregate public schedules without exposing Auth history.
begin;
grant select on public.performer_appearances, public.event_slots, public.events to service_role;
commit;
