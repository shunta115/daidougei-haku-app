-- PROPOSAL ONLY. Requires separate production DB approval and verified backup/restore.
-- Do not use test-apply.sql against production. Existing appearance prerequisite is already present.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin if to_regclass('public.performer_appearances') is null or to_regclass('public.appearance_notification_events') is null then raise exception 'missing_production_prerequisite'; end if; end $$;

-- 20261029085105_add_appearance_map_coordinates.sql

-- Additive only: venue coordinates are optional and never inferred from a
-- performer's shared/current location. Existing appearances remain unchanged.
alter table public.performer_appearances
  add column if not exists venue_lat double precision,
  add column if not exists venue_lng double precision;

alter table public.performer_appearances
  drop constraint if exists performer_appearances_venue_coordinates_check;
alter table public.performer_appearances
  add constraint performer_appearances_venue_coordinates_check check (
    (venue_lat is null and venue_lng is null)
    or (venue_lat is not null and venue_lng is not null
      and venue_lat between -90 and 90 and venue_lng between -180 and 180)
  );

create index if not exists performer_appearances_public_map_idx
  on public.performer_appearances (starts_at, ends_at)
  where status = 'published' and venue_lat is not null and venue_lng is not null;


-- 20261029090008_add_day_of_appearance_reminders.sql

alter table public.appearance_notification_events
  drop constraint if exists appearance_notification_events_event_type_check;
alter table public.appearance_notification_events
  add constraint appearance_notification_events_event_type_check
  check (event_type in ('published','important_update','cancelled','postponed','day_of'));

create or replace function public.ensure_my_day_of_appearance_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_event_id uuid;
  row record;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  for row in
    select a.*, p.stage_name
    from public.follows f
    join public.performer_appearances a on a.performer_id = f.performer_id
    join public.performers p on p.id = a.performer_id
    left join public.notification_preferences pref on pref.user_id = f.fan_id
    where f.fan_id = v_user_id
      and a.status = 'published'
      and a.performance_date = (clock_timestamp() at time zone a.timezone)::date
      and coalesce(pref.appearance_in_app_enabled, true)
  loop
    insert into public.appearance_notification_events
      (appearance_id, performer_id, event_type, change_fingerprint, payload)
    values (
      row.id, row.performer_id, 'day_of',
      md5('day_of|' || row.id::text || '|' || row.performance_date::text),
      jsonb_build_object('appearanceId', row.id, 'performerId', row.performer_id,
        'stageName', row.stage_name, 'title', row.title, 'date', row.performance_date,
        'startTime', row.start_time, 'venueName', row.venue_name, 'eventType', 'day_of',
        'url', '/?profile=' || row.performer_id::text || '&schedule=' || row.id::text)
    ) on conflict (appearance_id, event_type, change_fingerprint)
      do update set appearance_id = excluded.appearance_id
    returning id into v_event_id;

    insert into public.notifications
      (user_id, title, body, link, notification_event_id, kind, meta)
    values (
      v_user_id, '本日の出演予定', row.stage_name || '・' || row.title,
      '/?profile=' || row.performer_id::text || '&schedule=' || row.id::text,
      v_event_id, 'appearance',
      jsonb_build_object('appearanceId', row.id, 'performerId', row.performer_id,
        'stageName', row.stage_name, 'title', row.title, 'date', row.performance_date,
        'startTime', row.start_time, 'venueName', row.venue_name, 'eventType', 'day_of')
    ) on conflict (user_id, notification_event_id) where notification_event_id is not null do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.ensure_my_day_of_appearance_reminders() from public, anon;
grant execute on function public.ensure_my_day_of_appearance_reminders() to authenticated;


-- 20261030182434_harden_notification_client_inserts.sql
-- System notifications are written by SECURITY DEFINER functions or service_role.
-- No browser code inserts notifications. Preserve LIVE/tip writers and own reads.

drop policy if exists notifications_insert_system on public.notifications;
revoke insert on public.notifications from anon, authenticated;
grant insert on public.notifications to service_role;


commit;
