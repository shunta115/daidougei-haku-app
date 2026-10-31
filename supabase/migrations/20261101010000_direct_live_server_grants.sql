-- Presence checks and admin termination use the trusted server client.
-- BYPASSRLS does not confer table privileges. No browser grants are expanded.
grant select on public.live_sessions to service_role;
grant update (viewer_peak) on public.live_sessions to service_role;
