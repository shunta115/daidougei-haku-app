-- Additive controls. Sending remains disabled until separately approved.
begin;
create table public.smart_push_control (
  id smallint primary key default 1 check(id=1),
  enabled boolean not null default false,
  daily_budget integer not null default 500 check(daily_budget between 0 and 500)
);
alter table public.smart_push_control enable row level security;
alter table public.smart_push_control force row level security;
revoke all on public.smart_push_control from public,anon,authenticated;
grant all on public.smart_push_control to service_role;
insert into public.smart_push_control(id) values(1);
alter table public.live_push_events add column audience_cursor uuid, add column audience_complete boolean not null default false;
alter table public.live_push_deliveries drop constraint live_push_deliveries_status_check;
alter table public.live_push_deliveries add constraint live_push_deliveries_status_check check(status in ('queued','processing','sent','failed','unknown','suppressed'));
create table public.smart_push_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_push_events(id),
  claimed integer not null check(claimed between 0 and 5),
  accepted integer not null, failed integer not null, unknown integer not null, suppressed integer not null,
  elapsed_ms integer not null check(elapsed_ms>=0), created_at timestamptz not null default now()
);
alter table public.smart_push_runs enable row level security;
alter table public.smart_push_runs force row level security;
revoke all on public.smart_push_runs from public,anon,authenticated;
grant all on public.smart_push_runs to service_role;
create index live_push_enrollment_budget_idx on public.live_push_deliveries(created_at);
create index smart_push_runs_time_idx on public.smart_push_runs(created_at);

create or replace function public.reconcile_live_push_queue()
returns void language sql security invoker set search_path='' as $$
 update public.live_push_deliveries set status='unknown',last_error='worker_interrupted'
   where status='processing' and updated_at<now()-interval '2 minutes';
 update public.live_push_deliveries d set status='suppressed',last_error='live_expired_or_cancelled'
   from public.live_push_events e join public.live_sessions s on s.id=e.live_session_id
   where d.event_id=e.id and d.status='queued' and (e.cancelled_at is not null or e.created_at<now()-interval '5 minutes' or s.ended_at is not null or not s.follower_push_requested);
$$;
revoke all on function public.reconcile_live_push_queue() from public,anon,authenticated;
grant execute on function public.reconcile_live_push_queue() to service_role;

create or replace function public.enqueue_live_start_push(p_live_session_id uuid,p_owner_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare ev public.live_push_events%rowtype; s record; candidate record; page_count integer:=0; page_limit integer;
begin
  if not exists(select 1 from public.smart_push_control where id=1 and enabled and daily_budget>0) then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(117119);
  perform public.reconcile_live_push_queue();
  select ls.*,p.stage_name into s from public.live_sessions ls join public.performers p on p.id=ls.performer_id
    join public.profiles pr on pr.id=p.id where ls.id=p_live_session_id and ls.performer_id=p_owner_id
    and ls.ended_at is null and ls.follower_push_requested and p.is_live and p.is_approved and not p.is_private_test
    and pr.status::text='active' and ls.started_at>now()-interval '5 minutes' for update of ls;
  if not found then return null; end if;
  insert into public.live_push_events(live_session_id,performer_id,payload) values(s.id,s.performer_id,
    jsonb_build_object('eventType','live_start','liveSessionId',s.id,'performerId',s.performer_id,'stageName',s.stage_name,'url','/?watch='||s.performer_id::text))
    on conflict(live_session_id) do nothing;
  select * into ev from public.live_push_events where live_session_id=s.id for update;
  if ev.audience_complete or ev.cancelled_at is not null or ev.created_at<now()-interval '5 minutes' then return ev.id; end if;
  select least(100,greatest(0,c.daily_budget-(select count(*) from public.live_push_deliveries where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'))) into page_limit from public.smart_push_control c where c.id=1;
  if page_limit=0 then return ev.id; end if;
  -- Stable keyset pages: never silently truncate the audience to the first 500.
  -- The separate global attempt budget remains authoritative.
  for candidate in
    select distinct on(f.fan_id) f.fan_id,ps.id as subscription_id
    from public.follows f join public.notification_preferences pref on pref.user_id=f.fan_id and pref.live_push_enabled and pref.push_all_enabled
    join public.profiles pr on pr.id=f.fan_id and pr.status::text='active'
    join public.push_subscriptions ps on ps.user_id=f.fan_id and ps.disabled_at is null
    where f.performer_id=s.performer_id and f.fan_id>coalesce(ev.audience_cursor,'00000000-0000-0000-0000-000000000000'::uuid)
    order by f.fan_id,ps.updated_at desc,ps.id limit page_limit
  loop
    insert into public.live_push_deliveries(event_id,user_id,subscription_id) values(ev.id,candidate.fan_id,candidate.subscription_id) on conflict do nothing;
    ev.audience_cursor:=candidate.fan_id; page_count:=page_count+1;
  end loop;
  update public.live_push_events set audience_cursor=ev.audience_cursor,audience_complete=(page_count<page_limit) where id=ev.id;
  return ev.id;
end; $$;
revoke all on function public.enqueue_live_start_push(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_live_start_push(uuid,uuid) to service_role;
create or replace function public.claim_live_start_push_deliveries(p_event_id uuid,p_limit integer default 20)
returns table(delivery_id uuid,subscription_id uuid,endpoint text,p256dh text,auth text,locale text,payload jsonb,attempts integer)
language plpgsql security invoker set search_path = '' as $$
declare e record; d record; pref record; local_now timestamp; used_day integer; used_week integer; same_performer integer; v_budget integer;
begin
  select daily_budget into v_budget from public.smart_push_control where id=1 and enabled;
  if not found then return; end if;
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
  if (select count(*) from public.live_push_deliveries budget where budget.attempts>0 and budget.updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=v_budget then return; end if;
  -- Lock each recipient's preference row before counting/reserving their quota.
  -- This serializes concurrent notifications from different performers.
  for d in select q.* from public.live_push_deliveries q where q.event_id=p_event_id and q.status='queued'
    order by q.created_at,q.id for update skip locked limit greatest(1,least(p_limit,5))
  loop
    if (select count(*) from public.live_push_deliveries budget where budget.attempts>0 and budget.updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=v_budget then exit; end if;
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


create or replace function public.live_push_progress(p_event_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('queued',(select count(*) from public.live_push_deliveries d where d.event_id=e.id and d.status='queued'),
 'audienceComplete',e.audience_complete,'waitingMs',greatest(0,ceil(extract(epoch from e.created_at+interval '45 seconds'-now())*1000)),
 'active',e.cancelled_at is null and e.created_at>now()-interval '5 minutes' and s.ended_at is null and s.follower_push_requested and c.enabled,
 'enrollmentRemaining',greatest(0,c.daily_budget-(select count(*) from public.live_push_deliveries where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')),
 'budgetRemaining',greatest(0,c.daily_budget-(select count(*) from public.live_push_deliveries where attempts>0 and updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')))
 from public.live_push_events e join public.live_sessions s on s.id=e.live_session_id cross join public.smart_push_control c where e.id=p_event_id and c.id=1;
$$;
revoke all on function public.live_push_progress(uuid) from public,anon,authenticated;
grant execute on function public.live_push_progress(uuid) to service_role;
commit;
