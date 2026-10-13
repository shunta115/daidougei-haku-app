-- Runs after the independently reviewed 20261013 payout reservation migration.
begin;

create table if not exists public.performer_appearances (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers(id) on delete restrict,
  title text not null,
  performance_date date not null,
  start_time time not null,
  end_time time,
  timezone text not null default 'Asia/Tokyo',
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null,
  venue_address text not null default '',
  region text not null default '',
  country text not null default '',
  description text not null default '',
  admission_type text not null default 'free' check (admission_type in ('free','paid','tip')),
  admission_details text not null default '',
  image_url text,
  ticket_url text,
  is_live_planned boolean not null default false,
  rain_policy text not null default '',
  organizer_info text not null default '',
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft','published','private','cancelled','postponed','archived')),
  published_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(title)) between 1 and 120),
  check (length(btrim(venue_name)) between 1 and 160),
  check (end_time is null or end_time > start_time),
  check (image_url is null or image_url ~ '^https://'),
  check (ticket_url is null or ticket_url ~ '^https://')
);

create unique index if not exists performer_appearances_no_duplicate_idx
  on public.performer_appearances (
    performer_id,
    lower(btrim(title)),
    performance_date,
    start_time,
    lower(btrim(venue_name))
  ) where status not in ('cancelled','archived');
create index if not exists performer_appearances_public_upcoming_idx
  on public.performer_appearances (performer_id, starts_at)
  where status = 'published';

alter table public.performer_appearances enable row level security;
drop policy if exists performer_appearances_read on public.performer_appearances;
create policy performer_appearances_read on public.performer_appearances
  for select using (
    status = 'published'
    or (status in ('cancelled','postponed') and published_at is not null)
    or performer_id = auth.uid()
    or public.is_admin()
  );
drop policy if exists performer_appearances_insert on public.performer_appearances;
create policy performer_appearances_insert on public.performer_appearances
  for insert with check (performer_id = auth.uid() or public.is_admin());
drop policy if exists performer_appearances_update on public.performer_appearances;
create policy performer_appearances_update on public.performer_appearances
  for update using (performer_id = auth.uid() or public.is_admin())
  with check (performer_id = auth.uid() or public.is_admin());
drop policy if exists performer_appearances_delete on public.performer_appearances;
create policy performer_appearances_delete on public.performer_appearances
  for delete using ((performer_id = auth.uid() and status in ('draft','private','archived')) or public.is_admin());

grant select on public.performer_appearances to anon, authenticated;
grant insert, update, delete on public.performer_appearances to authenticated;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  appearance_in_app_enabled boolean not null default true,
  appearance_push_enabled boolean not null default false,
  locale text not null default 'ja' check (locale in ('ja','en','zh-TW')),
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
grant select, insert, update on public.notification_preferences to authenticated;

alter table public.push_subscriptions add column if not exists disabled_at timestamptz;
alter table public.push_subscriptions add column if not exists last_success_at timestamptz;
alter table public.push_subscriptions add column if not exists last_error text;
alter table public.push_subscriptions add column if not exists updated_at timestamptz not null default now();
grant update on public.push_subscriptions to authenticated;

create table if not exists public.appearance_notification_events (
  id uuid primary key default gen_random_uuid(),
  appearance_id uuid not null references public.performer_appearances(id) on delete cascade,
  performer_id uuid not null references public.performers(id) on delete restrict,
  event_type text not null check (event_type in ('published','important_update','cancelled','postponed')),
  change_fingerprint text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (appearance_id, event_type, change_fingerprint)
);
create index if not exists appearance_notification_events_performer_idx
  on public.appearance_notification_events (performer_id, created_at desc);
alter table public.appearance_notification_events enable row level security;
drop policy if exists appearance_notification_events_owner_read on public.appearance_notification_events;
create policy appearance_notification_events_owner_read on public.appearance_notification_events
  for select using (performer_id = auth.uid() or public.is_admin());
grant select on public.appearance_notification_events to authenticated;

alter table public.notifications add column if not exists notification_event_id uuid references public.appearance_notification_events(id) on delete set null;
alter table public.notifications add column if not exists kind text;
alter table public.notifications add column if not exists meta jsonb not null default '{}'::jsonb;
create unique index if not exists notifications_user_appearance_event_idx
  on public.notifications (user_id, notification_event_id)
  where notification_event_id is not null;

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid not null references public.appearance_notification_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','suppressed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_event_id, subscription_id)
);
create index if not exists push_notification_deliveries_queue_idx
  on public.push_notification_deliveries (notification_event_id, status, next_attempt_at);
alter table public.push_notification_deliveries enable row level security;
drop policy if exists push_notification_deliveries_admin_read on public.push_notification_deliveries;
create policy push_notification_deliveries_admin_read on public.push_notification_deliveries
  for select using (public.is_admin());
grant select on public.push_notification_deliveries to authenticated;

create or replace function public.prepare_performer_appearance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := btrim(new.title);
  new.venue_name := btrim(new.venue_name);
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone';
  end if;
  new.starts_at := (new.performance_date + new.start_time) at time zone new.timezone;
  new.ends_at := case when new.end_time is null then null else (new.performance_date + new.end_time) at time zone new.timezone end;
  if tg_op = 'INSERT' then
    new.published_at := case when new.status = 'published' then clock_timestamp() else null end;
    new.cancelled_at := case when new.status = 'cancelled' then clock_timestamp() else null end;
  else
    new.published_at := old.published_at;
    new.cancelled_at := old.cancelled_at;
    if new.status = 'published' and old.published_at is null then new.published_at := clock_timestamp(); end if;
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then new.cancelled_at := clock_timestamp(); end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists performer_appearances_prepare on public.performer_appearances;
create trigger performer_appearances_prepare
  before insert or update on public.performer_appearances
  for each row execute function public.prepare_performer_appearance();

create or replace function public.enqueue_appearance_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_fingerprint text;
  v_event_id uuid;
  v_stage_name text;
begin
  if new.status = 'cancelled'
    and tg_op = 'UPDATE'
    and old.status is distinct from 'cancelled'
    and old.published_at is not null then
    v_type := 'cancelled';
  elsif new.status = 'postponed'
    and tg_op = 'UPDATE'
    and old.status is distinct from 'postponed'
    and old.published_at is not null then
    v_type := 'postponed';
  elsif new.status = 'published'
    and (tg_op = 'INSERT' or old.published_at is null) then
    v_type := 'published';
  elsif tg_op = 'UPDATE' and new.status = 'published' and old.status = 'published' and (
    new.performance_date is distinct from old.performance_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.timezone is distinct from old.timezone
    or new.venue_name is distinct from old.venue_name
    or new.venue_address is distinct from old.venue_address
    or new.region is distinct from old.region
    or new.country is distinct from old.country
  ) then
    v_type := 'important_update';
  else
    return new;
  end if;

  select stage_name into v_stage_name from public.performers where id = new.performer_id;
  v_fingerprint := md5(concat_ws('|', v_type, new.performance_date, new.start_time, new.end_time, new.timezone, new.venue_name, new.venue_address, new.region, new.country, new.updated_at));

  insert into public.appearance_notification_events (appearance_id, performer_id, event_type, change_fingerprint, payload)
  values (new.id, new.performer_id, v_type, v_fingerprint, jsonb_build_object(
    'appearanceId', new.id, 'performerId', new.performer_id, 'stageName', coalesce(v_stage_name, ''),
    'title', new.title, 'date', new.performance_date, 'startTime', new.start_time,
    'venueName', new.venue_name, 'region', new.region, 'country', new.country,
    'eventType', v_type, 'url', '/?profile=' || new.performer_id::text || '&schedule=' || new.id::text
  ))
  on conflict (appearance_id, event_type, change_fingerprint) do nothing
  returning id into v_event_id;

  if v_event_id is null then return new; end if;

  insert into public.notifications (user_id, title, body, link, notification_event_id, kind, meta)
  select f.fan_id,
    case v_type when 'cancelled' then '出演中止のお知らせ' when 'postponed' then '出演延期のお知らせ' when 'important_update' then '出演予定が変更されました' else '新しい出演予定' end,
    coalesce(v_stage_name, 'パフォーマー') || '・' || new.title,
    '/?profile=' || new.performer_id::text || '&schedule=' || new.id::text,
    v_event_id, 'appearance', (select payload from public.appearance_notification_events where id = v_event_id)
  from public.follows f
  left join public.notification_preferences pref on pref.user_id = f.fan_id
  where f.performer_id = new.performer_id
    and coalesce(pref.appearance_in_app_enabled, true)
  on conflict (user_id, notification_event_id) where notification_event_id is not null do nothing;

  insert into public.push_notification_deliveries (notification_event_id, user_id, subscription_id)
  select v_event_id, f.fan_id, ps.id
  from public.follows f
  join public.notification_preferences pref on pref.user_id = f.fan_id and pref.appearance_push_enabled
  join public.push_subscriptions ps on ps.user_id = f.fan_id and ps.disabled_at is null
  where f.performer_id = new.performer_id
  on conflict (notification_event_id, subscription_id) do nothing;

  return new;
end;
$$;
drop trigger if exists performer_appearances_notify on public.performer_appearances;
create trigger performer_appearances_notify
  after insert or update on public.performer_appearances
  for each row execute function public.enqueue_appearance_notifications();

create or replace function public.claim_appearance_push_deliveries(p_event_id uuid, p_limit integer default 100)
returns table (
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text,
  locale text, payload jsonb, attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_notification_deliveries d
  set status = 'suppressed', last_error = 'recipient_not_eligible', updated_at = now()
  where d.notification_event_id = p_event_id
    and d.status = 'queued'
    and not exists (
      select 1
      from public.appearance_notification_events ev
      join public.follows f on f.fan_id = d.user_id and f.performer_id = ev.performer_id
      join public.notification_preferences pref on pref.user_id = d.user_id and pref.appearance_push_enabled
      join public.push_subscriptions ps on ps.id = d.subscription_id and ps.user_id = d.user_id and ps.disabled_at is null
      where ev.id = d.notification_event_id
    );

  return query
  with claimed as (
    select d.id
    from public.push_notification_deliveries d
    join public.appearance_notification_events ev on ev.id = d.notification_event_id
    join public.follows f on f.fan_id = d.user_id and f.performer_id = ev.performer_id
    join public.notification_preferences pref on pref.user_id = d.user_id and pref.appearance_push_enabled
    join public.push_subscriptions ps on ps.id = d.subscription_id and ps.user_id = d.user_id and ps.disabled_at is null
    where d.notification_event_id = p_event_id
      and (
        d.status in ('queued','failed')
        or (d.status = 'processing' and d.updated_at < now() - interval '15 minutes')
      )
      and d.attempts < 4
      and d.next_attempt_at <= now()
    order by d.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 250))
  ), updated as (
    update public.push_notification_deliveries d
    set status = 'processing', attempts = d.attempts + 1, updated_at = now()
    from claimed where d.id = claimed.id
    returning d.*
  )
  select u.id, ps.id, ps.endpoint, ps.p256dh, ps.auth,
    coalesce(pref.locale, 'ja'), ev.payload, u.attempts
  from updated u
  join public.push_subscriptions ps on ps.id = u.subscription_id and ps.user_id = u.user_id and ps.disabled_at is null
  join public.appearance_notification_events ev on ev.id = u.notification_event_id
  join public.follows f on f.fan_id = u.user_id and f.performer_id = ev.performer_id
  left join public.notification_preferences pref on pref.user_id = u.user_id
  where coalesce(pref.appearance_push_enabled, false);
end;
$$;
revoke all on function public.claim_appearance_push_deliveries(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_appearance_push_deliveries(uuid, integer) to service_role;

commit;
