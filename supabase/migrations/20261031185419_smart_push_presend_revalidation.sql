-- Recheck current quiet hours, quotas and emergency stop immediately before delivery.
begin;
create or replace function public.live_push_delivery_eligible(p_delivery_id uuid)
returns boolean language sql security invoker set search_path='' as $$
  select exists(select 1 from public.live_push_deliveries d
    join public.live_push_events e on e.id=d.event_id and e.cancelled_at is null and e.created_at>now()-interval '5 minutes'
    join public.live_sessions s on s.id=e.live_session_id and s.performer_id=e.performer_id and s.ended_at is null and s.follower_push_requested
    join public.performers p on p.id=e.performer_id and p.is_live and p.is_approved and not p.is_private_test
    join public.profiles owner on owner.id=p.id and owner.status='active'
    join public.profiles recipient on recipient.id=d.user_id and recipient.status='active'
    join public.follows f on f.fan_id=d.user_id and f.performer_id=e.performer_id
    join public.notification_preferences pref on pref.user_id=d.user_id and pref.live_push_enabled and pref.push_all_enabled
    join public.push_subscriptions ps on ps.id=d.subscription_id and ps.user_id=d.user_id and ps.disabled_at is null
    where d.id=p_delivery_id and d.status='processing' and d.attempts=1
      and exists(select 1 from public.smart_push_control where id=1 and enabled)
      and case when exists(select 1 from pg_catalog.pg_timezone_names z where z.name=pref.push_timezone) then
        (pref.push_start_hour=pref.push_end_hour
         or (pref.push_start_hour<pref.push_end_hour and extract(hour from now() at time zone pref.push_timezone)>=pref.push_start_hour and extract(hour from now() at time zone pref.push_timezone)<pref.push_end_hour)
         or (pref.push_start_hour>pref.push_end_hour and (extract(hour from now() at time zone pref.push_timezone)>=pref.push_start_hour or extract(hour from now() at time zone pref.push_timezone)<pref.push_end_hour)))
        else false end
      and (select count(*) from public.live_push_deliveries q where q.user_id=d.user_id and q.attempts>0 and q.updated_at>now()-interval '8 days' and (q.updated_at at time zone pref.push_timezone)::date=(now() at time zone pref.push_timezone)::date)<=pref.push_daily_limit
      and (select count(*) from public.live_push_deliveries q where q.user_id=d.user_id and q.attempts>0 and q.updated_at>now()-interval '8 days' and date_trunc('week',q.updated_at at time zone pref.push_timezone)=date_trunc('week',now() at time zone pref.push_timezone))<=pref.push_weekly_limit);

$$;
revoke all on function public.live_push_delivery_eligible(uuid) from public,anon,authenticated;
grant execute on function public.live_push_delivery_eligible(uuid) to service_role;
commit;
