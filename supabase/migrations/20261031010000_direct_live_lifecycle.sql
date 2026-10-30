-- APPROVAL REQUIRED: not applied to TEST or production by this change.
-- Preflight is intentionally non-destructive: resolve duplicates explicitly.
begin;
do $$ begin
  if exists (select 1 from public.live_sessions where ended_at is null group by performer_id having count(*) > 1) then
    raise exception 'Duplicate open LIVE sessions: review before applying lifecycle migration';
  end if;
end $$;
-- TEST was originally a minimal merch schema; add the LIVE prerequisites idempotently.
alter table public.live_sessions add column if not exists heartbeat_at timestamptz;
alter table public.live_sessions add column if not exists ended_reason text;
alter table public.live_sessions add column if not exists event_id uuid;
alter table public.live_sessions add column if not exists venue_id text;
alter table public.live_sessions add column if not exists event_slot_id uuid;
alter table public.live_sessions add column if not exists operation_id uuid;
alter table public.live_sessions add column if not exists lifecycle_state text not null default 'live'
  check (lifecycle_state in ('preparing','live','ended'));
create unique index if not exists live_sessions_one_open_performer on public.live_sessions(performer_id) where ended_at is null;

-- Reservations are not live_sessions: preparing the camera must not capture ordinary tips or inflate LIVE history.
create table if not exists public.direct_live_leases (
  performer_id uuid primary key references public.performers(id),
  id uuid not null unique default gen_random_uuid(), operation_id uuid not null,
  lifecycle_state text not null check(lifecycle_state in ('preparing','live','ended')),
  title text, started_at timestamptz not null default now(), heartbeat_at timestamptz not null default now(), ended_at timestamptz
);
alter table public.direct_live_leases enable row level security;
drop policy if exists direct_live_lease_owner_read on public.direct_live_leases;
create policy direct_live_lease_owner_read on public.direct_live_leases for select to authenticated using(performer_id=auth.uid());
revoke all on public.direct_live_leases from public,anon,authenticated;
grant select on public.direct_live_leases to authenticated;
grant all on public.direct_live_leases to service_role;

create or replace function public.reserve_direct_live(p_performer_id uuid, p_operation_id uuid, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.direct_live_leases%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_performer_id or p_operation_id is null then
    raise exception 'LIVE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.performers p join public.profiles pr on pr.id=p.id
    where p.id=p_performer_id and p.is_approved and pr.status::text='active' and pr.role::text='performer'
    for update of p;
  if not found then raise exception 'LIVE_APPROVAL_REQUIRED' using errcode='42501'; end if;
  select * into s from public.direct_live_leases where performer_id=p_performer_id and ended_at is null;
  if found then
    if coalesce(s.heartbeat_at,s.started_at) < now()-interval '90 seconds'
      or (s.lifecycle_state='live' and not exists(select 1 from public.live_sessions where id=s.id and ended_at is null)) then
      perform public.close_direct_live_session(p_performer_id,s.id,'heartbeat_timeout');
    else
      if s.operation_id is distinct from p_operation_id then raise exception 'LIVE_BUSY'; end if;
      return s.id;
    end if;
  end if;
  insert into public.direct_live_leases(performer_id,operation_id,lifecycle_state,title)
    values(p_performer_id,p_operation_id,'preparing',nullif(left(trim(p_title),200),''))
    on conflict(performer_id) do update set id=gen_random_uuid(),operation_id=excluded.operation_id,lifecycle_state='preparing',
      title=excluded.title,started_at=now(),heartbeat_at=now(),ended_at=null returning id into s.id;
  return s.id;
end $$;

create or replace function public.activate_direct_live(p_performer_id uuid, p_session_id uuid, p_operation_id uuid,
  p_event_id uuid default null, p_venue_id text default null, p_event_slot_id uuid default null, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.direct_live_leases%rowtype; stage text;
begin
  if auth.uid() is null or auth.uid()<>p_performer_id then raise exception 'LIVE_OWNER_REQUIRED' using errcode='42501'; end if;
  select p.stage_name into stage from public.performers p join public.profiles pr on pr.id=p.id
    where p.id=p_performer_id and p.is_approved and pr.status::text='active' and pr.role::text='performer' for update of p;
  if not found then raise exception 'LIVE_APPROVAL_REQUIRED' using errcode='42501'; end if;
  select * into s from public.direct_live_leases where id=p_session_id and performer_id=p_performer_id
    and operation_id=p_operation_id and ended_at is null for update;
  if not found then raise exception 'LIVE_SESSION_EXPIRED'; end if;
  if s.heartbeat_at is null or s.heartbeat_at < now()-interval '90 seconds' then raise exception 'LIVE_SESSION_EXPIRED'; end if;
  if s.lifecycle_state='live' then return s.id; end if;
  -- Event binding is optional; only a slot belonging to this performer/event is accepted.
  if p_event_slot_id is not null then
    if not exists (select 1 from public.event_slots e where e.id=p_event_slot_id and e.performer_id=p_performer_id
      and e.event_id=p_event_id and e.venue_id=p_venue_id) then raise exception 'LIVE_SLOT_MISMATCH'; end if;
  end if;
  s.title := coalesce(nullif(left(trim(p_title),200),''),s.title);
  insert into public.live_sessions(id,performer_id,operation_id,lifecycle_state,title,started_at,heartbeat_at,event_id,venue_id,event_slot_id)
    values(s.id,p_performer_id,p_operation_id,'live',s.title,now(),now(),p_event_id,p_venue_id,p_event_slot_id);
  update public.direct_live_leases set lifecycle_state='live',title=s.title,started_at=now(),heartbeat_at=now() where id=s.id;
  update public.performers set is_live=true,live_started_at=now(),live_title=s.title,stream_url=null where id=p_performer_id;
  -- Notification failure cannot partially publish the LIVE transaction.
  begin
    perform public.notify_followers_live_start(p_performer_id,stage,s.title);
  exception when others then raise warning 'LIVE follower notification failed'; end;
  return s.id;
end $$;

create or replace function public.close_direct_live_session(p_performer_id uuid, p_session_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.performers where id=p_performer_id for update;
  if not exists(select 1 from public.live_sessions where id=p_session_id and performer_id=p_performer_id)
    and not exists(select 1 from public.direct_live_leases where id=p_session_id and performer_id=p_performer_id) then
    raise exception 'LIVE_SESSION_NOT_FOUND';
  end if;
  update public.direct_live_leases set ended_at=now(),lifecycle_state='ended' where id=p_session_id and performer_id=p_performer_id and ended_at is null;
  update public.live_sessions set ended_at=now(),lifecycle_state='ended',ended_reason=p_reason
    where id=p_session_id and performer_id=p_performer_id and ended_at is null;
  if not exists(select 1 from public.live_sessions where performer_id=p_performer_id and ended_at is null)
    and not exists(select 1 from public.direct_live_leases where performer_id=p_performer_id and ended_at is null and id<>p_session_id) then
    update public.performers set is_live=false,share_location=false,live_started_at=null,live_title=null,
      lat=null,lng=null,location_updated_at=null where id=p_performer_id;
  end if;
  return true;
end $$;
create or replace function public.finish_direct_live(p_performer_id uuid, p_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid()<>p_performer_id then raise exception 'LIVE_OWNER_REQUIRED' using errcode='42501'; end if;
  return public.close_direct_live_session(p_performer_id,p_session_id,'host_ended');
end $$;

-- Bounded, lock-ordered cleanup; a renewed lease is rechecked under the same lock as start/end.
create or replace function public.expire_direct_live_leases()
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; n integer:=0;
begin
  for s in select id,performer_id from public.direct_live_leases where ended_at is null
      and heartbeat_at<now()-interval '90 seconds' order by performer_id limit 100 loop
    perform 1 from public.performers where id=s.performer_id for update;
    perform 1 from public.direct_live_leases where id=s.id and ended_at is null and heartbeat_at<now()-interval '90 seconds' for update;
    if found then
      perform public.close_direct_live_session(s.performer_id,s.id,'heartbeat_timeout');
      n:=n+1;
    end if;
  end loop;
  return n;
end $$;

-- Prevent old clients from bypassing the atomic lifecycle. Non-lifecycle fields stay writable under existing RLS/grants.
create or replace function public.guard_direct_live_lifecycle()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon','authenticated') then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name='performers' then
    if new.is_live is distinct from old.is_live or new.live_started_at is distinct from old.live_started_at then
      raise exception 'LIVE_ATOMIC_RPC_REQUIRED' using errcode='42501';
    end if;
  elsif tg_op in ('INSERT','DELETE') then
    raise exception 'LIVE_ATOMIC_RPC_REQUIRED' using errcode='42501';
  elsif (to_jsonb(new) - 'viewer_peak') is distinct from (to_jsonb(old) - 'viewer_peak') then
    raise exception 'LIVE_ATOMIC_RPC_REQUIRED' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists direct_live_guard on public.performers;
create trigger direct_live_guard before update on public.performers for each row execute function public.guard_direct_live_lifecycle();
drop trigger if exists direct_live_guard on public.live_sessions;
create trigger direct_live_guard before insert or update or delete on public.live_sessions for each row execute function public.guard_direct_live_lifecycle();
revoke all on function public.reserve_direct_live(uuid,uuid,text) from public,anon;
revoke all on function public.activate_direct_live(uuid,uuid,uuid,uuid,text,uuid,text) from public,anon;
revoke all on function public.finish_direct_live(uuid,uuid) from public,anon;
revoke all on function public.close_direct_live_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.close_direct_live_session(uuid,uuid,text) to service_role;
revoke all on function public.expire_direct_live_leases() from public,anon,authenticated;
grant execute on function public.reserve_direct_live(uuid,uuid,text),public.activate_direct_live(uuid,uuid,uuid,uuid,text,uuid,text),public.finish_direct_live(uuid,uuid) to authenticated;
grant execute on function public.expire_direct_live_leases() to service_role;
commit;
