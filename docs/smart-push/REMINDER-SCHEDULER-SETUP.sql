-- TEST ONLY until separately approved for production. No real subscriptions.
-- Run after the Phase 2 migration; DB controls default OFF.
-- Requires existing pg_cron, pg_net and Supabase Vault. No new paid services.
-- Set Vault notification_reminder_endpoint to the TEST preview's
-- /api/notifications/push?mode=reminders and notification_reminder_secret
-- to the same random value as that preview's NOTIFICATION_CRON_SECRET.
-- No protection bypass token: use a deployment reachable by this service or keep OFF.
-- Schedule creation is intentionally separate from the schema migration.
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='notification_reminder_endpoint' and decrypted_secret ~ '^https://[a-zA-Z0-9.-]+[.]vercel[.]app/api/notifications/push[?]mode=reminders$')
 or not exists(select 1 from vault.decrypted_secrets where name='notification_reminder_secret' and length(decrypted_secret)>=32)
 then raise exception 'TEST scheduler configuration missing'; end if;
end $$;
select cron.schedule('haku-notification-reminders','* * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='notification_reminder_endpoint'),
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='notification_reminder_secret'),'Content-Type','application/json'),
  body:='{}'::jsonb,timeout_milliseconds:=30000
 ) where exists(select 1 from public.notification_reminder_control where id=1 and enabled);
$job$);
-- Keep both controls false and all server flags OFF until TEST verification.
-- To stop: update public.notification_reminder_control set enabled=false,push_enabled=false where id=1;
-- Unknown/processing rows must never be reset or retried.
