-- System notifications are written by SECURITY DEFINER functions or service_role.
-- No browser code inserts notifications. Preserve LIVE/tip writers and own reads.
begin;
drop policy if exists notifications_insert_system on public.notifications;
revoke insert on public.notifications from anon, authenticated;
grant insert on public.notifications to service_role;
commit;
