-- Event experience metadata and secure, date-scoped voting.
-- Additive: keeps legacy votes and all existing event/payment/user rows.

begin;
set local lock_timeout = '5s';

alter table public.events
  add column if not exists hero_kicker_ja text not null default '',
  add column if not exists main_copy_ja text not null default '',
  add column if not exists sub_copy_ja text not null default '',
  add column if not exists admission_label text not null default '',
  add column if not exists guide_enabled boolean not null default true,
  add column if not exists results_published_at timestamptz;

alter table public.event_venues
  add column if not exists venue_type text not null default 'stage';

alter table public.event_venues
  drop constraint if exists event_venues_venue_type_check,
  add constraint event_venues_venue_type_check
    check (venue_type in ('stage', 'statue', 'roving', 'food', 'other')) not valid;
alter table public.event_venues validate constraint event_venues_venue_type_check;

create table if not exists public.event_vote_rules (
  event_id uuid primary key references public.events (id) on delete cascade,
  voting_open boolean not null default false,
  votes_per_user_per_day smallint not null default 1 check (votes_per_user_per_day between 1 and 10),
  voting_starts_at timestamptz,
  voting_ends_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.event_ballots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  fan_id uuid not null references public.profiles (id) on delete cascade,
  vote_date date not null default ((now() at time zone 'Asia/Tokyo')::date),
  created_at timestamptz not null default now(),
  unique (event_id, fan_id, vote_date, performer_id)
);

create index if not exists event_ballots_event_date_performer_idx
  on public.event_ballots (event_id, vote_date, performer_id);

-- Preserve legacy votes as ballots. Existing rows are not changed or removed.
insert into public.event_ballots (event_id, performer_id, fan_id, vote_date, created_at)
select event_id, performer_id, fan_id, (created_at at time zone 'Asia/Tokyo')::date, created_at
from public.event_votes
on conflict (event_id, fan_id, vote_date, performer_id) do nothing;

alter table public.event_vote_rules enable row level security;
alter table public.event_ballots enable row level security;

-- Published events remain public during the event, and archived events remain
-- available afterwards. Drafts are still restricted to administrators.
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events
  for select using (status in ('published', 'archived') or public.is_admin());

drop policy if exists event_venues_public_read on public.event_venues;
create policy event_venues_public_read on public.event_venues
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.status in ('published', 'archived') or public.is_admin())
    )
  );

drop policy if exists event_slots_public_read on public.event_slots;
create policy event_slots_public_read on public.event_slots
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.status in ('published', 'archived') or public.is_admin())
    )
  );

drop policy if exists event_lineup_public_read on public.event_lineup;
create policy event_lineup_public_read on public.event_lineup
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.status in ('published', 'archived') or public.is_admin())
    )
  );

drop policy if exists event_vote_rules_public_read on public.event_vote_rules;
create policy event_vote_rules_public_read on public.event_vote_rules
  for select using (true);
drop policy if exists event_vote_rules_admin_write on public.event_vote_rules;
create policy event_vote_rules_admin_write on public.event_vote_rules
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_ballots_own_read on public.event_ballots;
create policy event_ballots_own_read on public.event_ballots
  for select using (fan_id = auth.uid() or public.is_admin());

-- Legacy raw vote totals must no longer reveal an in-progress ranking.
drop policy if exists event_votes_read on public.event_votes;
create policy event_votes_read on public.event_votes
  for select using (fan_id = auth.uid() or public.is_admin());
drop policy if exists event_votes_insert on public.event_votes;
drop policy if exists event_votes_delete_own on public.event_votes;
revoke insert, delete on public.event_votes from authenticated;

grant select on public.event_vote_rules to anon, authenticated;
grant insert, update, delete on public.event_vote_rules to authenticated;
grant select on public.event_ballots to authenticated;

create or replace function public.cast_event_vote(p_event_id uuid, p_performer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rule public.event_vote_rules%rowtype;
  today_jst date := (now() at time zone 'Asia/Tokyo')::date;
  used_votes integer;
  ballot_id uuid;
begin
  if uid is null then
    raise exception 'authentication_required';
  end if;
  if not exists (select 1 from public.profiles where id = uid and role = 'fan' and status = 'active') then
    raise exception 'fan_account_required';
  end if;
  if not exists (select 1 from public.events where id = p_event_id and status = 'published') then
    raise exception 'event_not_available';
  end if;
  select * into rule from public.event_vote_rules where event_id = p_event_id;
  if rule.event_id is null or not rule.voting_open then
    raise exception 'voting_closed';
  end if;
  if rule.voting_starts_at is not null and now() < rule.voting_starts_at then
    raise exception 'voting_not_started';
  end if;
  if rule.voting_ends_at is not null and now() >= rule.voting_ends_at then
    raise exception 'voting_ended';
  end if;
  if not exists (
    select 1 from public.event_lineup l
    join public.performers p on p.id = l.performer_id and p.is_approved is true
    where l.event_id = p_event_id and l.performer_id = p_performer_id
  ) then
    raise exception 'performer_not_eligible';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || uid::text || ':' || today_jst::text, 0));
  select count(*) into used_votes
  from public.event_ballots
  where event_id = p_event_id and fan_id = uid and vote_date = today_jst;
  if used_votes >= rule.votes_per_user_per_day then
    raise exception 'daily_vote_limit_reached';
  end if;

  insert into public.event_ballots (event_id, performer_id, fan_id, vote_date)
  values (p_event_id, p_performer_id, uid, today_jst)
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
    from public.event_ballots b
    where b.event_id = p_event_id
    group by b.performer_id
  ) ranked
  where exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.results_published_at <= now() or public.is_admin())
  )
  order by ranked.ranking_position;
$$;

revoke all on function public.cast_event_vote(uuid, uuid) from public;
grant execute on function public.cast_event_vote(uuid, uuid) to authenticated;
grant execute on function public.get_public_event_results(uuid) to anon, authenticated;

update public.events
set
  hero_kicker_ja = case when hero_kicker_ja = '' then '国内外で受賞歴のある大道芸人が集結！' else hero_kicker_ja end,
  main_copy_ja = case when main_copy_ja = '' then '観る。選ぶ。もう一度、沸く。' else main_copy_ja end,
  sub_copy_ja = case when sub_copy_ja = '' then 'あなたの一票で、夜のステージが決まる。' else sub_copy_ja end,
  admission_label = case when admission_label = '' then '入場無料' else admission_label end,
  hours_label = case when hours_label = '' then '10:00〜19:00' else hours_label end,
  updated_at = now()
where slug = 'award-winning-performers-2026';

insert into public.event_vote_rules (event_id, voting_open, votes_per_user_per_day)
select id, false, 1 from public.events where slug = 'award-winning-performers-2026'
on conflict (event_id) do nothing;

commit;
