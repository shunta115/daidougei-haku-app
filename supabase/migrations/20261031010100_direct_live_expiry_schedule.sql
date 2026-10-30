-- APPROVAL REQUIRED. Apply migration 1 first, and apply both with the same DB owner.
-- SQL cron expires unpublished preparations only. Active LIVE requires the SFU-aware presence watchdog.
begin;
select pg_advisory_xact_lock(hashtextextended('haku.direct-live.migration',0));
do $$ declare signature text; begin
  if to_regclass('public.direct_live_leases') is null
    or to_regprocedure('public.renew_direct_live_lease(uuid,uuid,uuid)') is null
    or to_regprocedure('public.observe_direct_live_host(uuid,uuid,timestamptz,boolean)') is null
    or to_regprocedure('public.expire_direct_live_leases()') is null
    or to_regprocedure('public.close_direct_live_session(uuid,uuid,text)') is null
    or to_regprocedure('public.notify_followers_live_start(uuid,text,text)') is null then
    raise exception 'Apply DIRECT lifecycle migration 1 before scheduling';
  end if;
  foreach signature in array array[
    'public.expire_direct_live_leases()', 'public.close_direct_live_session(uuid,uuid,text)',
    'public.renew_direct_live_lease(uuid,uuid,uuid)', 'public.observe_direct_live_host(uuid,uuid,timestamptz,boolean)',
    'public.notify_followers_live_start(uuid,text,text)'
  ] loop
    if has_function_privilege('authenticated',signature,'EXECUTE') or has_function_privilege('anon',signature,'EXECUTE') then
      raise exception 'Unsafe lifecycle EXECUTE privileges: %',signature;
    end if;
  end loop;
end $$;
create extension if not exists pg_cron with schema pg_catalog;
-- Fail instead of silently hiding another owner's jobs behind RLS.
set local row_security = off;
do $$ begin
  if (select count(*) from cron.job where jobname='haku-direct-live-expiry') > 1 then
    raise exception 'Duplicate cron jobs: review without deleting existing jobs';
  end if;
  if exists(select 1 from cron.job where jobname='haku-direct-live-expiry' and username<>current_user) then
    raise exception 'Cron owner mismatch: apply as original owner';
  end if;
  if exists(select 1 from cron.job where jobname='haku-direct-live-expiry' and active is not true) then
    raise exception 'Cron job is paused: do not reactivate without separate approval';
  end if;
  if exists(select 1 from cron.job where jobname='haku-direct-live-expiry'
    and command is distinct from 'select public.expire_direct_live_leases()') then
    raise exception 'Cron command mismatch: review existing job';
  end if;
end $$;
-- pg_cron upserts by (jobname,current_user), retaining a single job on reapplication.
select cron.schedule('haku-direct-live-expiry', '* * * * *', 'select public.expire_direct_live_leases()');
commit;
