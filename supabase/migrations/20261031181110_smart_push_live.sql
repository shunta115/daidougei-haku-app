-- Optional LIVE Web Push queue. Prepare only; production application requires approval.
-- Existing appearance events, deliveries, LIVE records, and payment data are untouched.
begin;

alter table public.notification_preferences
  add column if not exists live_push_enabled boolean not null default false,
  add column if not exists push_all_enabled boolean not null default true,
  add column if not exists push_timezone text not null default 'UTC',
  add column if not exists push_start_hour integer not null default 9 check (push_start_hour between 0 and 23),
  add column if not exists push_end_hour integer not null default 21 check (push_end_hour between 0 and 23),
  add column if not exists push_daily_limit integer not null default 2 check (push_daily_limit between 0 and 2),
  add column if not exists push_weekly_limit integer not null default 8 check (push_weekly_limit between 0 and 8);
alter table public.live_sessions add column if not exists follower_push_requested boolean not null default false;

create table if not exists public.live_push_events (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null unique references public.live_sessions(id) on delete cascade,
  performer_id uuid not null references public.performers(id) on delete restrict,
  payload jsonb not null,
  cancelled_at timestamptz,
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
  unique (event_id, subscription_id),
  unique (event_id, user_id)
);
create index if not exists live_push_deliveries_queue_idx
  on public.live_push_deliveries (event_id, status, next_attempt_at);
alter table public.live_push_deliveries enable row level security;
alter table public.live_push_deliveries force row level security;
revoke all on table public.live_push_deliveries from anon, authenticated;
grant all on table public.live_push_deliveries to service_role;


-- Reuse PR99's dedicated LIVE queue (appearance deliveries require an appearance FK).
-- New RPCs use caller privileges; only intent is available to authenticated users.
create or replace function public.set_live_push_intent(p_session_id uuid, p_notify boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare s record;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into s from public.live_sessions where id=p_session_id and performer_id=auth.uid() and ended_at is null for update;
  if not found then raise exception 'not_owner_or_ended'; end if;
  if p_notify and s.started_at<now()-interval '30 seconds' then raise exception 'intent_window_closed'; end if;
  update public.live_sessions set follower_push_requested=p_notify where id=s.id;
end; $$;
revoke all on function public.set_live_push_intent(uuid,boolean) from public,anon;
grant execute on function public.set_live_push_intent(uuid,boolean) to authenticated;

create or replace function public.enqueue_live_start_push(p_live_session_id uuid, p_owner_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_event_id uuid; s record;
begin
  select ls.*, p.stage_name into s from public.live_sessions ls
    join public.performers p on p.id=ls.performer_id
    join public.profiles pr on pr.id=p.id
    where ls.id=p_live_session_id and ls.performer_id=p_owner_id and ls.ended_at is null
      and ls.follower_push_requested and p.is_live and p.is_approved and not p.is_private_test
      and pr.status='active' and ls.started_at > now()-interval '5 minutes'
    for update of ls;
  if not found then return null; end if;
  insert into public.live_push_events(live_session_id,performer_id,payload)
    values(s.id,s.performer_id,jsonb_build_object('eventType','live_start','liveSessionId',s.id,
      'performerId',s.performer_id,'stageName',s.stage_name,'url','/?watch='||s.performer_id::text))
    on conflict(live_session_id) do nothing returning id into v_event_id;
  if v_event_id is null then
    select id into v_event_id from public.live_push_events where live_session_id=s.id;
    return v_event_id;
  end if;
  insert into public.live_push_deliveries(event_id,user_id,subscription_id)
    select distinct on(f.fan_id) v_event_id,f.fan_id,ps.id
    from public.follows f
    join public.notification_preferences pref on pref.user_id=f.fan_id and pref.live_push_enabled and pref.push_all_enabled
    join public.profiles pr on pr.id=f.fan_id and pr.status='active'
    join public.push_subscriptions ps on ps.user_id=f.fan_id and ps.disabled_at is null
    where f.performer_id=s.performer_id
    order by f.fan_id,ps.id limit 500
    on conflict do nothing;
  return v_event_id;
end; $$;
revoke all on function public.enqueue_live_start_push(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_live_start_push(uuid,uuid) to service_role;

create or replace function public.claim_live_start_push_deliveries(p_event_id uuid,p_limit integer default 20)
returns table(delivery_id uuid,subscription_id uuid,endpoint text,p256dh text,auth text,locale text,payload jsonb,attempts integer)
language plpgsql security invoker set search_path = '' as $$
declare e record; d record; pref record; local_now timestamp; used_day integer; used_week integer; same_performer integer;
begin
  select ev.*,s.ended_at,s.follower_push_requested,p.is_live,p.is_approved,p.is_private_test,pr.status as owner_status
    into e from public.live_push_events ev join public.live_sessions s on s.id=ev.live_session_id
    join public.performers p on p.id=ev.performer_id join public.profiles pr on pr.id=p.id where ev.id=p_event_id;
  if not found then return; end if;
  if e.cancelled_at is not null or e.ended_at is not null or not e.follower_push_requested
    or not e.is_live or not e.is_approved or e.is_private_test or e.owner_status<>'active'
    or e.created_at < now()-interval '5 minutes' then
    update public.live_push_deliveries set status='suppressed',last_error='live_ineligible',updated_at=now()
      where event_id=p_event_id and status='queued';
    return;
  end if;
  if now()<e.created_at+interval '45 seconds' then return; end if;
  -- Fixed launch budget: at most 500 attempts/day across all LIVE recipients.
  -- An advisory transaction lock serializes the count and reservations.
  perform pg_catalog.pg_advisory_xact_lock(117119);
  if (select count(*) from public.live_push_deliveries budget where budget.attempts>0 and budget.updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=500 then return; end if;
  -- Lock each recipient's preference row before counting/reserving their quota.
  -- This serializes concurrent notifications from different performers.
  for d in select q.* from public.live_push_deliveries q where q.event_id=p_event_id and q.status='queued'
    order by q.created_at,q.id for update skip locked limit greatest(1,least(p_limit,20))
  loop
    if (select count(*) from public.live_push_deliveries budget where budget.attempts>0 and budget.updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=500 then exit; end if;
    select * into pref from public.notification_preferences where user_id=d.user_id for update;
    if not found or not pref.live_push_enabled or not pref.push_all_enabled
      or not exists(select 1 from public.follows f where f.fan_id=d.user_id and f.performer_id=e.performer_id)
      or not exists(select 1 from public.profiles pr where pr.id=d.user_id and pr.status='active')
      or not exists(select 1 from public.push_subscriptions ps where ps.id=d.subscription_id and ps.user_id=d.user_id and ps.disabled_at is null)
      or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=pref.push_timezone)
    then
      update public.live_push_deliveries set status='suppressed',last_error='recipient_ineligible',updated_at=now() where id=d.id; continue;
    end if;
    local_now=now() at time zone pref.push_timezone;
    -- start=end means no quiet hours. Windows may cross midnight.
    if (pref.push_start_hour<pref.push_end_hour and
         (extract(hour from local_now)<pref.push_start_hour or extract(hour from local_now)>=pref.push_end_hour))
      or (pref.push_start_hour>pref.push_end_hour and
         extract(hour from local_now)<pref.push_start_hour and extract(hour from local_now)>=pref.push_end_hour)
    then
      update public.live_push_deliveries set status='suppressed',last_error='quiet_hours',updated_at=now() where id=d.id; continue;
    end if;
    select count(*) filter(where (q.updated_at at time zone pref.push_timezone)::date=local_now::date),
           count(*) filter(where date_trunc('week',q.updated_at at time zone pref.push_timezone)=date_trunc('week',local_now)),
           count(*) filter(where ev.performer_id=e.performer_id and (q.updated_at at time zone pref.push_timezone)::date=local_now::date)
      into used_day,used_week,same_performer
      from public.live_push_deliveries q join public.live_push_events ev on ev.id=q.event_id
      where q.user_id=d.user_id and q.attempts>0 and q.updated_at>now()-interval '8 days';
    if used_day>=pref.push_daily_limit or used_week>=pref.push_weekly_limit or same_performer>=1 then
      update public.live_push_deliveries set status='suppressed',last_error='frequency_limit',updated_at=now() where id=d.id; continue;
    end if;
    update public.live_push_deliveries set status='processing',attempts=1,updated_at=now() where id=d.id and status='queued';
    return query select d.id,ps.id,ps.endpoint,ps.p256dh,ps.auth,pref.locale::text,e.payload,1 from public.push_subscriptions ps where ps.id=d.subscription_id;
  end loop;
end; $$;
revoke all on function public.claim_live_start_push_deliveries(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_live_start_push_deliveries(uuid,integer) to service_role;

create index if not exists live_push_global_budget_idx on public.live_push_deliveries(updated_at) where attempts>0;
create index if not exists live_push_recipient_quota_idx on public.live_push_deliveries(user_id,updated_at) where attempts>0;

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
    where d.id=p_delivery_id and d.status='processing' and d.attempts=1);
$$;
revoke all on function public.live_push_delivery_eligible(uuid) from public,anon,authenticated;
grant execute on function public.live_push_delivery_eligible(uuid) to service_role;
commit;
