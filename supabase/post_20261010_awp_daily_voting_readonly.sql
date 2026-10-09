-- READ ONLY verification after 20261010_awp_daily_official_voting.sql.
-- This script performs no writes.
begin transaction read only;

select e.id, e.slug, e.status, e.starts_on, e.ends_on, e.results_published_at
from public.events e where e.slug='award-winning-performers-2026';

select r.event_id, r.voting_enabled, r.voting_open, r.votes_per_device,
       r.voting_starts_at, r.voting_ends_at
from public.event_vote_rules r join public.events e on e.id=r.event_id
where e.slug='award-winning-performers-2026';

select to_regclass('public.event_vote_days') event_vote_days,
       to_regclass('public.event_vote_day_results') event_vote_day_results;

select d.vote_date, d.starts_at at time zone 'Asia/Tokyo' starts_jst,
       d.ends_at at time zone 'Asia/Tokyo' ends_jst, d.emergency_stopped,
       d.result_status, d.assignment_status, d.finalized_at
from public.event_vote_days d join public.events e on e.id=d.event_id
where e.slug='award-winning-performers-2026' order by d.vote_date;

select b.vote_date, count(*) official_votes, count(distinct b.device_hash) devices
from public.event_device_ballots b join public.events e on e.id=b.event_id
where e.slug='award-winning-performers-2026' group by b.vote_date order by b.vote_date;

select count(*) legacy_votes_preserved from public.event_ballots b
join public.events e on e.id=b.event_id where e.slug='award-winning-performers-2026';

select s.date, s.performance_type, count(*) slots,
       count(*) filter(where s.performer_id is not null) assigned
from public.event_slots s join public.events e on e.id=s.event_id
where e.slug='award-winning-performers-2026'
group by s.date,s.performance_type order by s.date,s.performance_type;

rollback;
