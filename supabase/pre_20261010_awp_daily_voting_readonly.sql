-- READ ONLY preflight for 20261010_awp_daily_official_voting.sql.
begin transaction read only;

select e.id, e.slug, e.status, e.starts_on, e.ends_on, e.results_published_at
from public.events e where e.slug='award-winning-performers-2026';

select r.event_id, r.voting_enabled, r.voting_open, r.votes_per_device,
       r.voting_starts_at, r.voting_ends_at
from public.event_vote_rules r join public.events e on e.id=r.event_id
where e.slug='award-winning-performers-2026';

select count(*) official_device_votes from public.event_device_ballots b
join public.events e on e.id=b.event_id where e.slug='award-winning-performers-2026';

select count(*) legacy_votes_preserved from public.event_ballots b
join public.events e on e.id=b.event_id where e.slug='award-winning-performers-2026';

select s.date, s.performance_type, count(*) slots,
       count(*) filter(where s.performer_id is not null) assigned,
       count(*) filter(where lower(coalesce(s.status,'scheduled')) in ('cancelled','canceled')) cancelled
from public.event_slots s join public.events e on e.id=s.event_id
where e.slug='award-winning-performers-2026'
group by s.date,s.performance_type order by s.date,s.performance_type;

select s.date, p.stage_name, count(*) scheduled_regular_slots
from public.event_slots s join public.events e on e.id=s.event_id
join public.performers p on p.id=s.performer_id
where e.slug='award-winning-performers-2026' and s.performance_type='regular'
  and lower(coalesce(s.status,'scheduled')) not in ('cancelled','canceled')
group by s.date,p.id,p.stage_name order by s.date,p.stage_name;

rollback;
