-- SEPARATE APPROVAL REQUIRED, TEST included. Uses existing Supabase pg_cron only.
-- Enables the bundled pg_cron extension after explicit approval; no external subscription.
-- Installation/scheduling availability still requires verification in the approved TEST environment.
begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('haku-direct-live-expiry', '* * * * *', 'select public.expire_direct_live_leases()');
commit;
