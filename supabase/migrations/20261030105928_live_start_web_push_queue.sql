-- Optional LIVE Web Push queue. Prepare only; production application requires approval.
-- Existing appearance events, deliveries, LIVE records, and payment data are untouched.
begin;

alter table public.notification_preferences
  add column if not exists live_push_enabled boolean not null default false;

create table if not exists public.live_push_events (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null unique references public.live_sessions(id) on delete cascade,
  performer_id uuid not null references public.performers(id) on delete restrict,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.live_push_events enable row level security;
alter table public.live_push_events force row level security;
revoke all on table public.live_push_events from anon, authenticated;
grant all on table public.live_push_events to service_role;

create table if not exists public.live_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_push_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','suppressed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, subscription_id)
);
create index if not exists live_push_deliveries_queue_idx
  on public.live_push_deliveries (event_id, status, next_attempt_at);
alter table public.live_push_deliveries enable row level security;
alter table public.live_push_deliveries force row level security;
revoke all on table public.live_push_deliveries from anon, authenticated;
grant all on table public.live_push_deliveries to service_role;

create or replace function public.enqueue_live_start_push(p_live_session_id uuid, p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_performer_id uuid;
  v_stage_name text;
  v_title text;
begin
  select s.performer_id, p.stage_name, s.title
  into v_performer_id, v_stage_name, v_title
  from public.live_sessions s
  join public.performers p on p.id = s.performer_id
  join public.profiles profile on profile.id = p.id
  where s.id = p_live_session_id and s.performer_id = p_owner_id
    and s.ended_at is null and p.is_live = true and p.is_approved = true
    and p.is_private_test = false and profile.status = 'active'
  for update of s;
  if not found then raise exception 'live_not_eligible'; end if;

  insert into public.live_push_events (live_session_id, performer_id, payload)
  values (p_live_session_id, v_performer_id, jsonb_build_object(
    'eventType', 'live_start', 'liveSessionId', p_live_session_id,
    'performerId', v_performer_id, 'stageName', coalesce(v_stage_name, ''),
    'title', coalesce(v_title, ''), 'url', '/?watch=' || v_performer_id::text
  )) on conflict (live_session_id) do nothing;
  select e.id into v_event_id from public.live_push_events e where e.live_session_id = p_live_session_id;

  insert into public.live_push_deliveries (event_id, user_id, subscription_id)
  select v_event_id, f.fan_id, ps.id
  from public.follows f
  join public.notification_preferences pref on pref.user_id = f.fan_id and pref.live_push_enabled
  join public.push_subscriptions ps on ps.user_id = f.fan_id and ps.disabled_at is null
  where f.performer_id = v_performer_id
  on conflict (event_id, subscription_id) do nothing;
  return v_event_id;
end;
$$;
revoke all on function public.enqueue_live_start_push(uuid, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_live_start_push(uuid, uuid) to service_role;

create or replace function public.claim_live_start_push_deliveries(p_event_id uuid, p_limit integer default 100)
returns table (
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text,
  locale text, payload jsonb, attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.live_push_deliveries d
  set status = 'suppressed', last_error = 'recipient_or_live_not_eligible', updated_at = now()
  where d.event_id = p_event_id and d.status in ('queued','processing','failed')
    and not exists (
      select 1 from public.live_push_events e
      join public.live_sessions s on s.id = e.live_session_id and s.performer_id = e.performer_id and s.ended_at is null
      join public.performers p on p.id = e.performer_id and p.is_live and p.is_approved and not p.is_private_test
      join public.profiles profile on profile.id = p.id and profile.status = 'active'
      join public.follows f on f.performer_id = e.performer_id and f.fan_id = d.user_id
      join public.notification_preferences pref on pref.user_id = d.user_id and pref.live_push_enabled
      join public.push_subscriptions ps on ps.id = d.subscription_id and ps.user_id = d.user_id and ps.disabled_at is null
      where e.id = d.event_id
    );

  return query
  with claimed as (
    select d.id from public.live_push_deliveries d
    join public.live_push_events e on e.id = d.event_id
    join public.live_sessions s on s.id = e.live_session_id and s.performer_id = e.performer_id and s.ended_at is null
    join public.performers p on p.id = e.performer_id and p.is_live and p.is_approved and not p.is_private_test
    join public.profiles profile on profile.id = p.id and profile.status = 'active'
    join public.follows f on f.performer_id = e.performer_id and f.fan_id = d.user_id
    join public.notification_preferences pref on pref.user_id = d.user_id and pref.live_push_enabled
    join public.push_subscriptions ps on ps.id = d.subscription_id and ps.user_id = d.user_id and ps.disabled_at is null
    where d.event_id = p_event_id
      and (d.status in ('queued','failed') or (d.status = 'processing' and d.updated_at < now() - interval '15 minutes'))
      and d.attempts < 4 and d.next_attempt_at <= now()
    order by d.created_at
    for update of d skip locked
    limit greatest(1, least(p_limit, 250))
  ), updated as (
    update public.live_push_deliveries d
    set status = 'processing', attempts = d.attempts + 1, updated_at = now()
    from claimed where d.id = claimed.id returning d.*
  )
  select u.id, ps.id, ps.endpoint, ps.p256dh, ps.auth,
    coalesce(pref.locale, 'ja'), e.payload, u.attempts
  from updated u
  join public.live_push_events e on e.id = u.event_id
  join public.push_subscriptions ps on ps.id = u.subscription_id and ps.user_id = u.user_id and ps.disabled_at is null
  join public.notification_preferences pref on pref.user_id = u.user_id and pref.live_push_enabled;
end;
$$;
revoke all on function public.claim_live_start_push_deliveries(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_live_start_push_deliveries(uuid, integer) to service_role;

commit;
