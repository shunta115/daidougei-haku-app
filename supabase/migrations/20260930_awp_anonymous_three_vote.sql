-- Anonymous 3-vote ballots for AWP. Additive: does not alter or delete
-- legacy event_votes / event_ballots rows or authenticated daily voting.

begin;
set local lock_timeout = '5s';

alter table public.event_vote_rules
  add column if not exists allow_anonymous boolean not null default false,
  add column if not exists votes_per_voter smallint not null default 3;

alter table public.event_vote_rules
  drop constraint if exists event_vote_rules_votes_per_voter_check;
alter table public.event_vote_rules
  add constraint event_vote_rules_votes_per_voter_check
    check (votes_per_voter between 1 and 10) not valid;
alter table public.event_vote_rules validate constraint event_vote_rules_votes_per_voter_check;

create table if not exists public.event_anon_ballots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  unique (event_id, voter_id, performer_id)
);

create index if not exists event_anon_ballots_event_created_idx
  on public.event_anon_ballots (event_id, created_at);
create index if not exists event_anon_ballots_event_voter_idx
  on public.event_anon_ballots (event_id, voter_id);

create table if not exists public.event_anon_vote_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  voter_id uuid not null,
  performer_id uuid,
  outcome text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_anon_vote_attempts_voter_created_idx
  on public.event_anon_vote_attempts (event_id, voter_id, created_at desc);

alter table public.event_anon_ballots enable row level security;
alter table public.event_anon_vote_attempts enable row level security;

drop policy if exists event_anon_ballots_admin_read on public.event_anon_ballots;
create policy event_anon_ballots_admin_read on public.event_anon_ballots
  for select using (public.is_admin());

drop policy if exists event_anon_vote_attempts_admin_read on public.event_anon_vote_attempts;
create policy event_anon_vote_attempts_admin_read on public.event_anon_vote_attempts
  for select using (public.is_admin());

grant select on public.event_anon_ballots to authenticated;
grant select on public.event_anon_vote_attempts to authenticated;

create or replace function public.cast_anon_event_vote(p_event_id uuid, p_performer_id uuid, p_voter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rule public.event_vote_rules%rowtype;
  used_votes integer;
  recent_attempts integer;
  ballot_id uuid;
  max_votes integer;
begin
  if p_voter_id is null then
    raise exception 'invalid_voter';
  end if;
  if not exists (select 1 from public.events where id = p_event_id and status = 'published') then
    raise exception 'event_not_available';
  end if;
  select * into rule from public.event_vote_rules where event_id = p_event_id;
  if rule.event_id is null or not rule.voting_open or not rule.allow_anonymous then
    raise exception 'voting_closed';
  end if;
  if rule.voting_starts_at is not null and now() < rule.voting_starts_at then
    raise exception 'voting_closed';
  end if;
  if rule.voting_ends_at is not null and now() >= rule.voting_ends_at then
    raise exception 'voting_closed';
  end if;
  if not exists (
    select 1 from public.event_lineup l
    join public.performers p on p.id = l.performer_id and p.is_approved is true
    where l.event_id = p_event_id and l.performer_id = p_performer_id
  ) then
    raise exception 'performer_not_eligible';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_voter_id::text, 0));

  select count(*) into recent_attempts
  from public.event_anon_ballots
  where event_id = p_event_id
    and voter_id = p_voter_id
    and created_at > now() - interval '700 milliseconds';
  if recent_attempts > 0 then
    raise exception 'vote_rate_limited';
  end if;

  max_votes := coalesce(rule.votes_per_voter, 3);
  select count(*) into used_votes
  from public.event_anon_ballots
  where event_id = p_event_id and voter_id = p_voter_id;
  if used_votes >= max_votes then
    raise exception 'voter_ballot_limit_reached';
  end if;

  insert into public.event_anon_ballots (event_id, performer_id, voter_id)
  values (p_event_id, p_performer_id, p_voter_id)
  returning id into ballot_id;

  insert into public.event_anon_vote_attempts (event_id, voter_id, performer_id, outcome)
  values (p_event_id, p_voter_id, p_performer_id, 'accepted');
  return ballot_id;
exception
  when unique_violation then
    raise exception 'already_voted_for_performer';
end;
$$;

create or replace function public.get_anon_vote_state(p_event_id uuid, p_voter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rule public.event_vote_rules%rowtype;
  used integer := 0;
  max_votes integer := 3;
  open_now boolean := false;
begin
  select * into rule from public.event_vote_rules where event_id = p_event_id;
  max_votes := coalesce(rule.votes_per_voter, 3);
  open_now := rule.event_id is not null
    and rule.voting_open
    and rule.allow_anonymous
    and (rule.voting_starts_at is null or now() >= rule.voting_starts_at)
    and (rule.voting_ends_at is null or now() < rule.voting_ends_at);
  select count(*) into used
  from public.event_anon_ballots
  where event_id = p_event_id and voter_id = p_voter_id;
  return jsonb_build_object(
    'voting_open', open_now,
    'max_votes', max_votes,
    'used', used,
    'remaining', greatest(0, max_votes - used),
    'voted', coalesce((
      select jsonb_agg(performer_id)
      from public.event_anon_ballots
      where event_id = p_event_id and voter_id = p_voter_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_event_vote_desk(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rule public.event_vote_rules%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;
  select * into rule from public.event_vote_rules where event_id = p_event_id;
  return jsonb_build_object(
    'voting_open', coalesce(rule.voting_open, false),
    'allow_anonymous', coalesce(rule.allow_anonymous, false),
    'votes_per_voter', coalesce(rule.votes_per_voter, 3),
    'total_votes', (
      select count(*) from (
        select id from public.event_anon_ballots where event_id = p_event_id
        union all
        select id from public.event_ballots where event_id = p_event_id
      ) t
    ),
    'unique_voters', (
      select count(*) from (
        select voter_id::text from public.event_anon_ballots where event_id = p_event_id
        union
        select fan_id::text from public.event_ballots where event_id = p_event_id
      ) t
    ),
    'ranking', coalesce((
      select jsonb_agg(row_to_json(r) order by r.votes desc, r.performer_id)
      from (
        select performer_id, count(*)::int as votes
        from (
          select performer_id from public.event_anon_ballots where event_id = p_event_id
          union all
          select performer_id from public.event_ballots where event_id = p_event_id
        ) all_votes
        group by performer_id
      ) r
    ), '[]'::jsonb),
    'hourly', coalesce((
      select jsonb_agg(row_to_json(h) order by h.hour)
      from (
        select date_trunc('hour', created_at) as hour, count(*)::int as votes
        from (
          select created_at from public.event_anon_ballots where event_id = p_event_id
          union all
          select created_at from public.event_ballots where event_id = p_event_id
        ) all_times
        group by 1
      ) h
    ), '[]'::jsonb),
    'anomalies', coalesce((
      select jsonb_agg(row_to_json(a))
      from (
        select left(voter_id::text, 8) as voter_prefix,
          count(*)::int as votes,
          extract(epoch from (max(created_at) - min(created_at)))::int as span_seconds,
          'fast_three_votes' as kind
        from public.event_anon_ballots
        where event_id = p_event_id
        group by voter_id
        having count(*) >= 3
          and extract(epoch from (max(created_at) - min(created_at))) < 20
      ) a
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_public_event_results(p_event_id uuid)
returns table (performer_id uuid, votes bigint, ranking_position bigint)
language sql
stable
security definer
set search_path = public
as $$
  select ranked.performer_id, ranked.votes, ranked.ranking_position
  from (
    select b.performer_id, count(*)::bigint as votes,
      row_number() over (order by count(*) desc, b.performer_id) as ranking_position
    from (
      select performer_id from public.event_ballots where event_id = p_event_id
      union all
      select performer_id from public.event_anon_ballots where event_id = p_event_id
    ) b
    group by b.performer_id
  ) ranked
  where exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.results_published_at <= now() or public.is_admin())
  )
  order by ranked.ranking_position;
$$;

revoke all on function public.cast_anon_event_vote(uuid, uuid, uuid) from public;
revoke all on function public.get_anon_vote_state(uuid, uuid) from public;
revoke all on function public.admin_event_vote_desk(uuid) from public;
grant execute on function public.cast_anon_event_vote(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.get_anon_vote_state(uuid, uuid) to anon, authenticated;
grant execute on function public.admin_event_vote_desk(uuid) to authenticated;
grant execute on function public.get_public_event_results(uuid) to anon, authenticated;

update public.event_vote_rules
set allow_anonymous = true,
    votes_per_voter = 3,
    updated_at = now()
where event_id in (select id from public.events where slug = 'award-winning-performers-2026');

insert into public.event_vote_rules (event_id, voting_open, votes_per_user_per_day, allow_anonymous, votes_per_voter)
select id, false, 1, true, 3 from public.events where slug = 'award-winning-performers-2026'
on conflict (event_id) do nothing;

commit;
