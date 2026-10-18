-- AWP device voting and event-scoped eligibility.
-- Additive: preserves event_votes, event_ballots and every existing ballot.

begin;
set local lock_timeout = '5s';

alter table public.event_vote_rules
  add column if not exists voting_enabled boolean not null default false,
  add column if not exists votes_per_device smallint not null default 3;

alter table public.event_vote_rules
  drop constraint if exists event_vote_rules_votes_per_device_check;
alter table public.event_vote_rules
  add constraint event_vote_rules_votes_per_device_check
  check (votes_per_device between 1 and 10) not valid;
alter table public.event_vote_rules
  validate constraint event_vote_rules_votes_per_device_check;

alter table public.event_lineup
  add column if not exists is_voting_eligible boolean not null default false;

comment on column public.event_lineup.is_voting_eligible is
  'Event-scoped voting eligibility; independent from event participation.';

create index if not exists event_lineup_voting_eligible_idx
  on public.event_lineup (event_id, is_voting_eligible, sort_order);

create table if not exists public.event_device_ballots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (event_id, device_hash, performer_id)
);

create index if not exists event_device_ballots_event_created_idx
  on public.event_device_ballots (event_id, created_at);
create index if not exists event_device_ballots_event_device_idx
  on public.event_device_ballots (event_id, device_hash);

alter table public.event_device_ballots enable row level security;

drop policy if exists event_device_ballots_admin_read on public.event_device_ballots;
create policy event_device_ballots_admin_read on public.event_device_ballots
  for select using (public.is_admin());

revoke all on table public.event_device_ballots from anon, authenticated;
grant select on table public.event_device_ballots to authenticated;

create or replace function public.cast_device_event_vote(
  p_event_id uuid,
  p_performer_id uuid,
  p_device_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rule public.event_vote_rules%rowtype;
  used_votes integer;
  ballot_id uuid;
begin
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_device';
  end if;
  if not exists (
    select 1 from public.events
    where id = p_event_id and status = 'published'
  ) then raise exception 'event_not_available'; end if;

  select * into rule from public.event_vote_rules where event_id = p_event_id;
  if rule.event_id is null or not rule.voting_enabled then raise exception 'voting_disabled'; end if;
  if not rule.voting_open then raise exception 'voting_closed'; end if;
  if rule.voting_starts_at is not null and now() < rule.voting_starts_at then raise exception 'voting_not_started'; end if;
  if rule.voting_ends_at is not null and now() >= rule.voting_ends_at then raise exception 'voting_ended'; end if;
  if not exists (
    select 1
    from public.event_lineup l
    join public.performers p
      on p.id = l.performer_id and p.is_approved is true
    where l.event_id = p_event_id
      and l.performer_id = p_performer_id
      and l.is_voting_eligible is true
  ) then raise exception 'performer_not_eligible'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_device_hash, 0));
  select count(*) into used_votes
  from public.event_device_ballots
  where event_id = p_event_id and device_hash = p_device_hash;
  if used_votes >= rule.votes_per_device then raise exception 'device_vote_limit_reached'; end if;

  insert into public.event_device_ballots (event_id, performer_id, device_hash)
  values (p_event_id, p_performer_id, p_device_hash)
  returning id into ballot_id;
  return ballot_id;
exception
  when unique_violation then raise exception 'already_voted_for_performer';
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
    from public.event_device_ballots b
    join public.event_lineup l
      on l.event_id = b.event_id
     and l.performer_id = b.performer_id
     and l.is_voting_eligible is true
    where b.event_id = p_event_id
    group by b.performer_id
  ) ranked
  where exists (
    select 1 from public.events e
    join public.event_vote_rules r on r.event_id = e.id
    where e.id = p_event_id
      and r.voting_enabled is true
      and (e.results_published_at <= now() or public.is_admin())
  )
  order by ranked.ranking_position;
$$;

-- Official voting is server-mediated so anonymous and signed-in visitors share
-- the same HttpOnly device identity. Block the legacy direct client RPC.
revoke all on function public.cast_event_vote(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cast_device_event_vote(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cast_device_event_vote(uuid, uuid, text) to service_role;
grant execute on function public.get_public_event_results(uuid) to anon, authenticated;

-- Only AWP is enabled. Reception remains closed until ADMIN explicitly opens it.
update public.event_vote_rules
set voting_enabled = true,
    votes_per_device = 3,
    updated_at = now()
where event_id = (
  select id from public.events where slug = 'award-winning-performers-2026'
);

commit;
