-- AWP 2026 daily official voting (JST).
-- Additive and non-destructive: existing ballots are retained and dated from created_at.
begin;
set local lock_timeout = '5s';

do $$
declare
  awp_id uuid;
  d date;
begin
  select id into awp_id from public.events where slug='award-winning-performers-2026';
  if awp_id is null or (select count(*) from public.events where slug='award-winning-performers-2026') <> 1 then
    raise exception 'AWP event precondition failed';
  end if;
  foreach d in array array['2026-10-10'::date,'2026-10-11'::date,'2026-10-12'::date] loop
    if (select count(*) from public.event_slots where event_id=awp_id and date=d
          and performance_type='special_final') <> 3 then
      raise exception 'AWP SPECIAL STAGE precondition failed for %', d;
    end if;
    if (select count(*) from public.event_slots where event_id=awp_id and date=d
          and performance_type='regular' and performer_id is not null
          and lower(coalesce(status,'scheduled')) not in ('cancelled','canceled')) < 3 then
      raise exception 'AWP regular-stage precondition failed for %', d;
    end if;
  end loop;
end;
$$;

alter table public.event_device_ballots
  add column if not exists vote_date date;

update public.event_device_ballots
set vote_date = (created_at at time zone 'Asia/Tokyo')::date
where vote_date is null;

alter table public.event_device_ballots
  alter column vote_date set default ((now() at time zone 'Asia/Tokyo')::date),
  alter column vote_date set not null;

alter table public.event_device_ballots
  drop constraint if exists event_device_ballots_event_id_device_hash_performer_id_key;

create unique index if not exists event_device_ballots_daily_performer_unique
  on public.event_device_ballots (event_id, vote_date, device_hash, performer_id);
create index if not exists event_device_ballots_daily_device_idx
  on public.event_device_ballots (event_id, vote_date, device_hash);

create table if not exists public.event_vote_days (
  event_id uuid not null references public.events(id) on delete cascade,
  vote_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  emergency_stopped boolean not null default false,
  finalized_at timestamptz,
  result_status text not null default 'pending'
    check (result_status in ('pending','final','tie','error')),
  assignment_status text not null default 'pending'
    check (assignment_status in ('pending','assigned','manual_required','error')),
  error_message text,
  updated_at timestamptz not null default now(),
  primary key (event_id, vote_date),
  check (ends_at > starts_at),
  check ((starts_at at time zone 'Asia/Tokyo')::date = vote_date),
  check ((ends_at at time zone 'Asia/Tokyo')::date = vote_date)
);

create table if not exists public.event_vote_day_results (
  event_id uuid not null,
  vote_date date not null,
  performer_id uuid not null references public.performers(id) on delete restrict,
  votes bigint not null check (votes > 0),
  ranking_position integer not null check (ranking_position > 0),
  tied boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, vote_date, performer_id),
  foreign key (event_id, vote_date)
    references public.event_vote_days(event_id, vote_date) on delete cascade
);

alter table public.event_vote_days enable row level security;
alter table public.event_vote_day_results enable row level security;

drop policy if exists event_vote_days_public_read on public.event_vote_days;
create policy event_vote_days_public_read on public.event_vote_days
  for select using (
    exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
    or public.is_admin()
  );
drop policy if exists event_vote_days_admin_write on public.event_vote_days;
create policy event_vote_days_admin_write on public.event_vote_days
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_vote_day_results_admin_read on public.event_vote_day_results;
create policy event_vote_day_results_admin_read on public.event_vote_day_results
  for select using (public.is_admin());

revoke all on public.event_vote_days from anon, authenticated;
grant select on public.event_vote_days to anon, authenticated;
revoke all on public.event_vote_day_results from anon, authenticated;
grant select on public.event_vote_day_results to authenticated;

insert into public.event_vote_days (event_id, vote_date, starts_at, ends_at)
select e.id, d.vote_date, d.starts_at, d.ends_at
from public.events e
cross join (values
  ('2026-10-10'::date, '2026-10-10 10:00:00+09'::timestamptz, '2026-10-10 16:20:00+09'::timestamptz),
  ('2026-10-11'::date, '2026-10-11 10:00:00+09'::timestamptz, '2026-10-11 16:20:00+09'::timestamptz),
  ('2026-10-12'::date, '2026-10-12 10:00:00+09'::timestamptz, '2026-10-12 16:20:00+09'::timestamptz)
) as d(vote_date, starts_at, ends_at)
where e.slug = 'award-winning-performers-2026'
on conflict (event_id, vote_date) do update
set starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now()
where public.event_vote_days.finalized_at is null;

update public.event_vote_rules
set voting_enabled = true, voting_open = true, votes_per_device = 3,
    voting_starts_at = null, voting_ends_at = null, updated_at = now()
where event_id = (select id from public.events where slug = 'award-winning-performers-2026');

create or replace function public.get_event_vote_day_state(p_event_id uuid, p_vote_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  d public.event_vote_days%rowtype;
  r public.event_vote_rules%rowtype;
  requested_date date := coalesce(p_vote_date, (now() at time zone 'Asia/Tokyo')::date);
begin
  select * into d from public.event_vote_days where event_id = p_event_id and vote_date = requested_date;
  select * into r from public.event_vote_rules where event_id = p_event_id;
  if d.event_id is null then
    return jsonb_build_object('vote_date', requested_date, 'configured', false, 'voting_open', false,
      'results_public', false, 'server_now', now());
  end if;
  return jsonb_build_object(
    'vote_date', d.vote_date, 'configured', true, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
    'voting_open', coalesce(r.voting_enabled,false) and coalesce(r.voting_open,false)
      and not d.emergency_stopped and now() >= d.starts_at and now() < d.ends_at,
    'results_public', now() >= d.ends_at and d.finalized_at is not null
      and d.result_status in ('final','tie'),
    'result_status', d.result_status, 'assignment_status', d.assignment_status,
    'server_now', now()
  );
end;
$$;

create or replace function public.cast_device_event_vote(
  p_event_id uuid, p_performer_id uuid, p_device_hash text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  rule public.event_vote_rules%rowtype;
  day_rule public.event_vote_days%rowtype;
  vote_day date := (now() at time zone 'Asia/Tokyo')::date;
  used_votes integer;
  ballot_id uuid;
begin
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_device'; end if;
  if not exists (select 1 from public.events where id = p_event_id and status = 'published') then
    raise exception 'event_not_available';
  end if;
  select * into rule from public.event_vote_rules where event_id = p_event_id;
  select * into day_rule from public.event_vote_days where event_id = p_event_id and vote_date = vote_day;
  if rule.event_id is null or not rule.voting_enabled then raise exception 'voting_disabled'; end if;
  if not rule.voting_open or day_rule.event_id is null or day_rule.emergency_stopped then raise exception 'voting_closed'; end if;
  if now() < day_rule.starts_at then raise exception 'voting_not_started'; end if;
  if now() >= day_rule.ends_at then raise exception 'voting_ended'; end if;
  if not exists (
    select 1 from public.event_lineup l
    join public.performers p on p.id = l.performer_id and p.is_approved is true
    where l.event_id = p_event_id and l.performer_id = p_performer_id
      and l.is_voting_eligible is true
      and exists (
        select 1 from public.event_slots s
        where s.event_id = p_event_id and s.performer_id = p_performer_id
          and s.date = vote_day and s.performance_type = 'regular'
          and lower(coalesce(s.status, 'scheduled')) not in ('cancelled','canceled')
      )
  ) then raise exception 'performer_not_eligible_today'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || vote_day::text || ':' || p_device_hash, 0));
  select count(*) into used_votes from public.event_device_ballots
   where event_id = p_event_id and vote_date = vote_day and device_hash = p_device_hash;
  if used_votes >= rule.votes_per_device then raise exception 'device_vote_limit_reached'; end if;
  insert into public.event_device_ballots(event_id, performer_id, device_hash, vote_date)
  values (p_event_id, p_performer_id, p_device_hash, vote_day)
  returning id into ballot_id;
  return ballot_id;
exception when unique_violation then raise exception 'already_voted_for_performer_today';
end;
$$;

create or replace function public.finalize_event_vote_day(p_event_id uuid, p_vote_date date)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  d public.event_vote_days%rowtype;
  candidate_count integer;
  top_count integer;
  top_distinct integer;
  cutoff_count integer;
  third_votes bigint;
  final_slot_count integer;
  assigned_slot_count integer;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_vote_date::text || ':finalize', 0));
  select * into d from public.event_vote_days where event_id = p_event_id and vote_date = p_vote_date for update;
  if d.event_id is null then raise exception 'vote_day_not_configured'; end if;
  if now() < d.ends_at then return public.get_event_vote_day_state(p_event_id, p_vote_date); end if;
  if d.finalized_at is not null then return public.get_event_vote_day_state(p_event_id, p_vote_date); end if;

  insert into public.event_vote_day_results(event_id, vote_date, performer_id, votes, ranking_position, tied)
  select p_event_id, p_vote_date, x.performer_id, x.votes,
         rank() over(order by x.votes desc)::integer,
         count(*) over(partition by x.votes) > 1
  from (
    select b.performer_id, count(*)::bigint votes
    from public.event_device_ballots b
    join public.event_lineup l on l.event_id=b.event_id and l.performer_id=b.performer_id and l.is_voting_eligible
    where b.event_id=p_event_id and b.vote_date=p_vote_date
      and exists (select 1 from public.event_slots s where s.event_id=p_event_id
        and s.performer_id=b.performer_id and s.date=p_vote_date and s.performance_type='regular'
        and lower(coalesce(s.status,'scheduled')) not in ('cancelled','canceled'))
    group by b.performer_id
  ) x;

  select count(*) into candidate_count from public.event_vote_day_results
   where event_id=p_event_id and vote_date=p_vote_date;
  select count(*), count(distinct votes), min(votes) into top_count, top_distinct, third_votes
  from (select votes from public.event_vote_day_results where event_id=p_event_id and vote_date=p_vote_date
        order by votes desc, performer_id limit 3) top3;
  select count(*) into cutoff_count from public.event_vote_day_results
   where event_id=p_event_id and vote_date=p_vote_date and votes >= third_votes;

  if candidate_count < 3 then
    update public.event_vote_days set finalized_at=now(), result_status='error', assignment_status='error',
      error_message='fewer_than_three_ranked_performers', updated_at=now()
    where event_id=p_event_id and vote_date=p_vote_date;
  elsif top_count <> 3 or top_distinct <> 3 or cutoff_count <> 3 then
    update public.event_vote_days set finalized_at=now(), result_status='tie', assignment_status='manual_required',
      error_message='top_three_tie_requires_admin', updated_at=now()
    where event_id=p_event_id and vote_date=p_vote_date;
  else
    select count(*), count(*) filter(where performer_id is not null)
      into final_slot_count, assigned_slot_count
    from public.event_slots where event_id=p_event_id and date=p_vote_date and performance_type='special_final';
    if final_slot_count <> 3 or assigned_slot_count <> 0 then
      update public.event_vote_days set finalized_at=now(), result_status='final', assignment_status='manual_required',
        error_message='special_stage_slots_require_admin_review', updated_at=now()
      where event_id=p_event_id and vote_date=p_vote_date;
    else
      update public.event_slots s set performer_id=r.performer_id
      from public.event_vote_day_results r
      where s.event_id=p_event_id and s.date=p_vote_date and s.performance_type='special_final'
        and s.ranking_position=r.ranking_position and r.event_id=p_event_id and r.vote_date=p_vote_date
        and r.ranking_position between 1 and 3;
      update public.event_vote_days set finalized_at=now(), result_status='final', assignment_status='assigned',
        error_message=null, updated_at=now()
      where event_id=p_event_id and vote_date=p_vote_date;
    end if;
  end if;
  return public.get_event_vote_day_state(p_event_id, p_vote_date);
end;
$$;

create or replace function public.get_public_event_results_by_day(p_event_id uuid, p_vote_date date)
returns table(performer_id uuid, votes bigint, ranking_position integer, tied boolean)
language sql stable security definer set search_path = public
as $$
  select r.performer_id, r.votes, r.ranking_position, r.tied
  from public.event_vote_day_results r
  join public.event_vote_days d using(event_id, vote_date)
  where r.event_id=p_event_id and r.vote_date=p_vote_date
    and now() >= d.ends_at and d.finalized_at is not null and d.result_status in ('final','tie')
  order by r.ranking_position, r.performer_id;
$$;

-- The legacy event-wide result RPC must never reveal or combine AWP's three days.
-- It remains available for other events for backwards compatibility.
create or replace function public.get_public_event_results(p_event_id uuid)
returns table (performer_id uuid, votes bigint, ranking_position bigint)
language sql stable security definer set search_path = public
as $$
  select ranked.performer_id, ranked.votes, ranked.ranking_position
  from (
    select b.performer_id, count(*)::bigint votes,
      rank() over(order by count(*) desc) ranking_position
    from public.event_device_ballots b
    join public.event_lineup l on l.event_id=b.event_id and l.performer_id=b.performer_id
      and l.is_voting_eligible is true
    where b.event_id=p_event_id
    group by b.performer_id
  ) ranked
  where exists (
    select 1 from public.events e join public.event_vote_rules r on r.event_id=e.id
    where e.id=p_event_id and e.slug <> 'award-winning-performers-2026'
      and r.voting_enabled is true and (e.results_published_at <= now() or public.is_admin())
  )
  order by ranked.ranking_position;
$$;

create or replace function public.admin_event_vote_desk(p_event_id uuid, p_vote_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  d public.event_vote_days%rowtype;
  r public.event_vote_rules%rowtype;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  select * into d from public.event_vote_days where event_id=p_event_id and vote_date=p_vote_date;
  select * into r from public.event_vote_rules where event_id=p_event_id;
  return jsonb_build_object(
    'vote_date', p_vote_date, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
    'voting_enabled', coalesce(r.voting_enabled,false),
    'voting_open', coalesce(r.voting_open,false) and not coalesce(d.emergency_stopped,true)
      and now() >= d.starts_at and now() < d.ends_at,
    'emergency_stopped', coalesce(d.emergency_stopped,false),
    'result_status', coalesce(d.result_status,'error'),
    'assignment_status', coalesce(d.assignment_status,'error'),
    'error_message', d.error_message,
    'votes_per_device', coalesce(r.votes_per_device,3),
    'total_votes', (select count(*) from public.event_device_ballots b
      where b.event_id=p_event_id and b.vote_date=p_vote_date),
    'unique_voters', (select count(distinct b.device_hash) from public.event_device_ballots b
      where b.event_id=p_event_id and b.vote_date=p_vote_date),
    'ranking', coalesce((select jsonb_agg(row_to_json(x) order by x.votes desc, x.performer_id)
      from (select b.performer_id,count(*)::int votes from public.event_device_ballots b
        where b.event_id=p_event_id and b.vote_date=p_vote_date group by b.performer_id) x),'[]'::jsonb),
    'legacy_test_votes', (select count(*) from public.event_ballots b where b.event_id=p_event_id)
  );
end;
$$;

revoke all on function public.cast_device_event_vote(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cast_device_event_vote(uuid,uuid,text) to service_role;
revoke all on function public.finalize_event_vote_day(uuid,date) from public,anon,authenticated;
grant execute on function public.finalize_event_vote_day(uuid,date) to service_role;
grant execute on function public.get_event_vote_day_state(uuid,date) to anon,authenticated,service_role;
grant execute on function public.get_public_event_results_by_day(uuid,date) to anon,authenticated,service_role;
revoke all on function public.admin_event_vote_desk(uuid,date) from public,anon;
grant execute on function public.admin_event_vote_desk(uuid,date) to authenticated;

commit;
