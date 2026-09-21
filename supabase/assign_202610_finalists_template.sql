-- Preview assignment of the current top three vote recipients to the 16:00-17:00 final.
-- Non-destructive by default: inspect the result and keep ROLLBACK until authorized.

begin;

with target_event as (
  select id from public.events where slug = 'award-winning-performers-2026'
),
ranked as (
  select
    l.performer_id,
    count(v.fan_id)::bigint as votes,
    row_number() over (order by count(v.fan_id) desc, l.performer_id) as ranking_position
  from public.event_lineup l
  join target_event e on e.id = l.event_id
  left join public.event_votes v
    on v.event_id = l.event_id
   and v.performer_id = l.performer_id
  group by l.performer_id
),
top_three as (
  select performer_id, ranking_position
  from ranked
  where ranking_position <= 3
)
update public.event_slots slot
set performer_id = top_three.performer_id
from target_event e
cross join top_three
where slot.event_id = e.id
  and slot.performance_type = 'special_final'
  and slot.date = '2026-10-12'
  and slot.ranking_position = top_three.ranking_position;

select
  slot.ranking_position,
  performer.stage_name,
  slot.date,
  slot.start_time,
  slot.end_time,
  venue.name_ja as venue
from public.event_slots slot
join public.events event on event.id = slot.event_id
left join public.performers performer on performer.id = slot.performer_id
join public.event_venues venue on venue.id = slot.venue_id
where event.slug = 'award-winning-performers-2026'
  and slot.performance_type = 'special_final'
order by slot.ranking_position;

rollback;
