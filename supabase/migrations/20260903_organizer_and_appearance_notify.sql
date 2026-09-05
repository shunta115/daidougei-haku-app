-- Follow-up after 20260902_launch_foundation.sql
-- 1) Use organizer role in handle_new_user (enum value must already exist)
-- 2) Admin RPC: notify followers/oshi of event lineup appearances

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role public.user_role;
begin
  begin
    chosen_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'fan');
  exception when invalid_text_representation then
    chosen_role := 'fan';
  end;
  if chosen_role not in ('fan', 'performer', 'organizer') then
    chosen_role := 'fan';
  end if;

  insert into public.profiles (id, role, status, display_name, email)
  values (
    new.id,
    chosen_role,
    case
      when chosen_role = 'performer' then 'pending'::public.account_status
      else 'active'::public.account_status
    end,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'User'),
    new.email
  );

  if chosen_role = 'performer' then
    insert into public.performers (id, stage_name, is_approved)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Performer'),
      false
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_event_appearances(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev_name text;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  select name_ja into ev_name from public.events where id = p_event_id;
  if ev_name is null then
    raise exception 'event not found';
  end if;

  insert into public.notifications (user_id, title, body, link)
  select distinct audience.user_id,
    '出演情報',
    coalesce(p.stage_name, 'パフォーマー') || ' が「' || ev_name || '」に出演します',
    'profile:' || el.performer_id::text
  from public.event_lineup el
  join public.performers p on p.id = el.performer_id
  cross join lateral (
    select fan_id as user_id from public.follows where performer_id = el.performer_id
    union
    select fan_id as user_id from public.oshi where performer_id = el.performer_id
  ) audience
  where el.event_id = p_event_id;
end;
$$;

revoke all on function public.notify_event_appearances(uuid) from public;
grant execute on function public.notify_event_appearances(uuid) to authenticated;
