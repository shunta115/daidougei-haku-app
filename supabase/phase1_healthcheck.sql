-- Read-only Phase 1 schema check. Does not change data.
select t as name, to_regclass('public.' || t) is not null as exists
from unnest(array[
  'profiles',
  'performers',
  'follows',
  'tips',
  'notifications',
  'live_sessions',
  'live_comments',
  'live_tip_events',
  'events',
  'event_venues',
  'event_slots',
  'event_lineup',
  'oshi',
  'event_votes',
  'platform_settings',
  'reports'
]) as t
order by 1;

select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user') > 0 as handle_new_user,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_followers_live_start') > 0 as notify_live_start,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_event_appearances') > 0 as notify_appearances,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin') > 0 as is_admin;
