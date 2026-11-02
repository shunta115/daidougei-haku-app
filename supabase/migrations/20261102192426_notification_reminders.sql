begin;
-- Additive, opt-in only. Applying this migration does not start a scheduler or send.
alter table public.notification_preferences add column if not exists live_reminder_push_enabled boolean not null default false;
alter table public.notification_preferences add column if not exists day_of_push_enabled boolean not null default false;
create table public.notification_reminder_control (
 id integer primary key check(id=1), enabled boolean not null default false,
 push_enabled boolean not null default false, activated_at timestamptz not null default now()
);
insert into public.notification_reminder_control(id) values(1);
alter table public.notification_reminder_control enable row level security;
revoke all on public.notification_reminder_control from public,anon,authenticated;
grant all on public.notification_reminder_control to service_role;
create table public.notification_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 event_key text not null, category text not null check(category in ('appearance','day_of','live_reminder')),
 source_id uuid not null, performer_id uuid not null references public.performers(id), payload jsonb not null,
 expires_at timestamptz not null, status text not null default 'queued' check(status in ('queued','processing','sent','failed','unknown','suppressed')),
 subscription_id uuid references public.push_subscriptions(id) on delete set null,
 attempted_at timestamptz, created_at timestamptz not null default now(), last_error text,
 unique(user_id,event_key)
);
alter table public.notification_jobs enable row level security;
revoke all on public.notification_jobs from public,anon,authenticated;
grant all on public.notification_jobs to service_role;
create index notification_jobs_queue on public.notification_jobs(created_at) where status='queued';
create index notification_jobs_quota on public.notification_jobs(user_id,attempted_at) where attempted_at is not null;
create unique index notifications_live_reminder_once on public.notifications(user_id,(meta->>'eventKey')) where kind='live_reminder';

create function public.collect_notification_reminders() returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.notification_reminder_control where id=1 and enabled) then return 0; end if;
 perform pg_catalog.pg_advisory_xact_lock(117119);
 -- Reuse the same event identity as the existing on-open day-of RPC.
 insert into public.appearance_notification_events(appearance_id,performer_id,event_type,change_fingerprint,payload)
 select a.id,a.performer_id,'day_of',md5('day_of|'||a.id::text||'|'||a.performance_date::text),
 jsonb_build_object('appearanceId',a.id,'performerId',a.performer_id,'stageName',p.stage_name,'title',a.title,'date',a.performance_date,'startTime',a.start_time,'venueName',a.venue_name,'eventType','day_of','url','/?profile='||a.performer_id::text||'&schedule='||a.id::text)
 from public.performer_appearances a join public.performers p on p.id=a.performer_id and p.is_approved and not p.is_private_test
 join public.profiles owner on owner.id=p.id and owner.status='active'
 join pg_catalog.pg_timezone_names z on z.name=a.timezone
 where a.status='published' and a.performance_date=(now() at time zone z.name)::date and a.starts_at>now()
 on conflict(appearance_id,event_type,change_fingerprint) do nothing;

 insert into public.notification_jobs(user_id,event_key,category,source_id,performer_id,payload,expires_at)
 select f.fan_id,'appearance:'||e.id::text,case when e.event_type='day_of' then 'day_of' else 'appearance' end,e.id,e.performer_id,e.payload,
 least(e.created_at+interval '24 hours',a.starts_at)
 from public.appearance_notification_events e join public.performer_appearances a on a.id=e.appearance_id
 join public.follows f on f.performer_id=e.performer_id join public.profiles fan on fan.id=f.fan_id and fan.status='active'
 where e.created_at>now()-interval '24 hours' and a.starts_at>now()
 and (e.event_type='day_of' or e.created_at>=(select activated_at from public.notification_reminder_control where id=1))
 on conflict(user_id,event_key) do nothing;

 insert into public.notification_jobs(user_id,event_key,category,source_id,performer_id,payload,expires_at)
 select r.user_id,'live-reminder:'||s.id::text,'live_reminder',s.id,s.performer_id,
 jsonb_build_object('title','予約LIVEがまもなく始まります','body',s.title,'url','/?profile='||s.performer_id::text,'scheduledStartAt',s.scheduled_start_at),s.scheduled_start_at
 from public.live_reservations r join public.live_schedules s on s.id=r.live_schedule_id
 join public.profiles fan on fan.id=r.user_id and fan.status='active'
 join public.performers p on p.id=s.performer_id and p.is_approved and not p.is_private_test
 join public.profiles owner on owner.id=p.id and owner.status='active'
 where s.status='scheduled' and s.scheduled_start_at>now() and s.scheduled_start_at<=now()+interval '10 minutes'
 on conflict(user_id,event_key) do nothing;

 insert into public.notifications(user_id,title,body,link,kind,meta)
 select j.user_id,j.payload->>'title',j.payload->>'body',j.payload->>'url','live_reminder',j.payload||jsonb_build_object('eventKey',j.event_key,'scheduleId',j.source_id)
 from public.notification_jobs j where j.category='live_reminder' and j.expires_at>now() and public.notification_job_source_valid(j.id)
 and exists(select 1 from public.live_reservations r where r.live_schedule_id=j.source_id and r.user_id=j.user_id)
 on conflict(user_id,(meta->>'eventKey')) where kind='live_reminder' do nothing;
 -- In-app day-of history remains available without OS permission or Push consent.
 insert into public.notifications(user_id,title,body,link,notification_event_id,kind,meta)
 select j.user_id,'本日の出演予定',coalesce(j.payload->>'stageName','')||'・'||coalesce(j.payload->>'title',''),j.payload->>'url',j.source_id,'appearance',j.payload
 from public.notification_jobs j left join public.notification_preferences pref on pref.user_id=j.user_id
 where j.category='day_of' and j.expires_at>now() and public.notification_job_source_valid(j.id) and coalesce(pref.appearance_in_app_enabled,true)
 on conflict(user_id,notification_event_id) where notification_event_id is not null do nothing;
 get diagnostics n=row_count;
 update public.notification_jobs set status='unknown',last_error='interrupted_attempt' where status='processing' and attempted_at<now()-interval '2 minutes';
 update public.notification_jobs set status='suppressed',last_error='expired' where status='queued' and expires_at<=now();
 return n;
end $$;

create function public.notification_job_source_valid(p_job_id uuid) returns boolean
language sql security invoker set search_path='' as $$
 select exists(select 1 from public.notification_jobs j
 join public.profiles fan on fan.id=j.user_id and fan.status='active'
 join public.performers p on p.id=j.performer_id and p.is_approved and not p.is_private_test
 join public.profiles owner on owner.id=p.id and owner.status='active'
 where j.id=p_job_id and j.expires_at>now() and (
 (j.category='live_reminder' and exists(select 1 from public.live_schedules s join public.live_reservations r on r.live_schedule_id=s.id and r.user_id=j.user_id
 where s.id=j.source_id and s.performer_id=j.performer_id and s.status='scheduled' and s.scheduled_start_at>now() and s.scheduled_start_at<=now()+interval '10 minutes'
 and s.scheduled_start_at=(j.payload->>'scheduledStartAt')::timestamptz))
 or (j.category in ('appearance','day_of') and exists(select 1 from public.appearance_notification_events e join public.performer_appearances a on a.id=e.appearance_id
 join public.follows f on f.performer_id=a.performer_id and f.fan_id=j.user_id
 where e.id=j.source_id and a.performer_id=j.performer_id and a.starts_at>now()
 and a.status=case e.event_type when 'cancelled' then 'cancelled' when 'postponed' then 'postponed' else 'published' end
 and a.title=j.payload->>'title' and a.venue_name=j.payload->>'venueName'
 and not exists(select 1 from public.appearance_notification_events newer where newer.appearance_id=a.id and newer.event_type<>'day_of' and newer.created_at>e.created_at)
 and a.performance_date::text=j.payload->>'date' and a.start_time::text=j.payload->>'startTime'
 and (j.category<>'day_of' or exists(select 1 from pg_catalog.pg_timezone_names z where z.name=a.timezone and a.performance_date=(now() at time zone z.name)::date))
 ))));
$$;

create function public.notification_job_eligible(p_job_id uuid) returns boolean
language sql security invoker set search_path='' as $$
 select exists(select 1 from public.notification_jobs j
 join public.notification_preferences pref on pref.user_id=j.user_id and pref.push_all_enabled
 join public.push_subscriptions ps on ps.id=j.subscription_id and ps.user_id=j.user_id and ps.disabled_at is null
 join pg_catalog.pg_timezone_names z on z.name=pref.push_timezone
 where j.id=p_job_id and j.status='processing' and public.notification_job_source_valid(j.id)
 and exists(select 1 from public.notification_reminder_control where id=1 and enabled and push_enabled)
 and case j.category when 'live_reminder' then pref.live_reminder_push_enabled when 'day_of' then pref.day_of_push_enabled else pref.appearance_push_enabled end
 and (pref.push_start_hour=pref.push_end_hour or
 (pref.push_start_hour<pref.push_end_hour and extract(hour from now() at time zone z.name)>=pref.push_start_hour and extract(hour from now() at time zone z.name)<pref.push_end_hour) or
 (pref.push_start_hour>pref.push_end_hour and (extract(hour from now() at time zone z.name)>=pref.push_start_hour or extract(hour from now() at time zone z.name)<pref.push_end_hour)))
 and (select count(*) from public.notification_jobs q where q.user_id=j.user_id and q.attempted_at is not null and (q.attempted_at at time zone z.name)::date=(now() at time zone z.name)::date)<=pref.push_daily_limit
 and (select count(*) from public.notification_jobs q where q.user_id=j.user_id and q.attempted_at is not null and date_trunc('week',q.attempted_at at time zone z.name)=date_trunc('week',now() at time zone z.name))<=pref.push_weekly_limit
 );
$$;
create function public.claim_notification_jobs(p_limit integer default 5)
returns table(id uuid,subscription_id uuid,endpoint text,p256dh text,auth text,payload jsonb,category text,event_key text,expires_at timestamptz)
language plpgsql security invoker set search_path='' as $$
declare j record; sub record;
begin
 if not exists(select 1 from public.notification_reminder_control c where c.enabled and c.push_enabled and c.id=1) then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(117119);
 for j in select q.* from public.notification_jobs q where q.status='queued' and q.attempted_at is null and q.expires_at>now() order by q.created_at,q.id for update skip locked limit greatest(0,least(p_limit,5)) loop
  if (select count(*) from public.notification_jobs q where q.attempted_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=500 then exit; end if;
  select ps.* into sub from public.push_subscriptions ps where ps.user_id=j.user_id and ps.disabled_at is null order by ps.updated_at desc,ps.id limit 1;
  if not found then continue; end if;
  update public.notification_jobs q set status='processing',attempted_at=now(),subscription_id=sub.id where q.id=j.id;
  if not public.notification_job_eligible(j.id) then
   update public.notification_jobs q set status='suppressed',last_error='ineligible_before_send',attempted_at=null where q.id=j.id;
   continue;
  end if;
  return query select j.id,sub.id,sub.endpoint,sub.p256dh,sub.auth,j.payload,j.category,j.event_key,j.expires_at;
 end loop;
end $$;
revoke all on function public.collect_notification_reminders(),public.notification_job_source_valid(uuid),public.notification_job_eligible(uuid),public.claim_notification_jobs(integer) from public,anon,authenticated;
grant execute on function public.collect_notification_reminders(),public.notification_job_source_valid(uuid),public.notification_job_eligible(uuid),public.claim_notification_jobs(integer) to service_role;
commit;
