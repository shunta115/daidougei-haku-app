begin;

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

commit;
