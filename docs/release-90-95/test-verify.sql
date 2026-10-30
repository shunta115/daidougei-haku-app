-- TEST ONLY aeqskxxykzapgaudbeqa. All test rows are rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
insert into public.follows(fan_id,performer_id)
values ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.performer_appearances
  (id,performer_id,title,performance_date,start_time,end_time,timezone,starts_at,venue_name,status,venue_lat,venue_lng)
values
  ('20909500-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Release 90-95 rollback test',(clock_timestamp() at time zone 'Asia/Tokyo')::date,'10:00','11:00','Asia/Tokyo',now(),'Test-only park','published',35.7,139.7),
  ('20909500-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Release 90-95 private',(clock_timestamp() at time zone 'Asia/Tokyo')::date,'12:00','13:00','Asia/Tokyo',now(),'Private park','private',35.7,139.7);
do $$ begin
  if not (select starts_at = (performance_date+start_time) at time zone timezone from performer_appearances where id='20909500-0000-4000-8000-000000000001') then raise exception 'timezone_failed'; end if;
  begin
    update performer_appearances set venue_lng=null where id='20909500-0000-4000-8000-000000000001';
    raise exception 'partial_coordinates_allowed';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if auth.uid() <> '10000000-0000-4000-8000-000000000002'::uuid or public.is_admin() then raise exception 'invalid_test_identity'; end if;
  begin
    insert into notifications(user_id,title) values ('10000000-0000-4000-8000-000000000003','forged');
    raise exception 'other_recipient_insert_allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into notifications(user_id,title) values ('10000000-0000-4000-8000-000000000002','forged');
    raise exception 'client_self_insert_allowed';
  exception when insufficient_privilege then null; end;
  if public.ensure_my_day_of_appearance_reminders() <> 1 then raise exception 'day_of_first_failed'; end if;
  if public.ensure_my_day_of_appearance_reminders() <> 0 then raise exception 'day_of_duplicate_failed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if public.ensure_my_day_of_appearance_reminders() <> 0 then raise exception 'non_follower_reminder'; end if;
  if exists(select 1 from notifications where user_id <> auth.uid()) then raise exception 'notification_read_leak'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- The existing LIVE helper is owner/internal-only on this TEST DB.
-- Exercise its system writer without granting any new caller privileges.
select public.notify_followers_live_start('10000000-0000-4000-8000-000000000001','Release rollback test',null);
reset role;
do $$ begin
  if not exists(select 1 from notifications where title='LIVE開始' and user_id='10000000-0000-4000-8000-000000000002') then raise exception 'existing_live_notification_broken'; end if;
end $$;
update performer_appearances set start_time='10:15' where id='20909500-0000-4000-8000-000000000001';
update performer_appearances set status='postponed' where id='20909500-0000-4000-8000-000000000001';
update performer_appearances set status='cancelled' where id='20909500-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from appearance_notification_events where appearance_id='20909500-0000-4000-8000-000000000001' and event_type='important_update') <> 1 then raise exception 'time_update_notification_failed'; end if;
  if (select count(*) from appearance_notification_events where appearance_id='20909500-0000-4000-8000-000000000001' and event_type='postponed') <> 1 then raise exception 'postpone_notification_failed'; end if;
  if (select count(*) from appearance_notification_events where appearance_id='20909500-0000-4000-8000-000000000001' and event_type='cancelled') <> 1 then raise exception 'cancel_notification_failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  if exists(select 1 from performer_appearances where id='20909500-0000-4000-8000-000000000002') then raise exception 'private_appearance_leak'; end if;
  if not exists(select 1 from performer_appearances where id='20909500-0000-4000-8000-000000000001' and status='cancelled') then raise exception 'public_cancellation_hidden'; end if;
  begin
    perform ensure_my_day_of_appearance_reminders();
    raise exception 'anonymous_reminder_allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: real TEST RLS, notification forgery denied, reminders idempotent, timezone, changes/cancellation, LIVE notification RPC; fixture writes rolled back' as result;
