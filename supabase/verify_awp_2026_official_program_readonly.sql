-- Read-only verification after both AWP SQL files have committed.
with awp as (
  select id from public.events where slug = 'award-winning-performers-2026'
), slot_counts as (
  select s.date, s.performance_type, count(*)::integer as count
  from public.event_slots s join awp on awp.id = s.event_id
  where s.source_label = 'AWPプログラム2026 全日分.pdf'
  group by s.date, s.performance_type
), unresolved as (
  select distinct s.performer_name_ja
  from public.event_slots s join awp on awp.id = s.event_id
  where s.source_label = 'AWPプログラム2026 全日分.pdf'
    and s.performer_name_ja is not null
    and s.performer_id is null
), summary as (
  select jsonb_build_object(
    'venues', (select count(*) from public.event_venues v join awp on awp.id=v.event_id where v.id like 'awp-2026-%'),
    'slots', (select count(*) from public.event_slots s join awp on awp.id=s.event_id where s.source_label='AWPプログラム2026 全日分.pdf'),
    'normal_slots', (select coalesce(sum(count),0) from slot_counts where performance_type='regular'),
    'special_night_slots', (select coalesce(sum(count),0) from slot_counts where performance_type='special_final'),
    'appearances', (select count(*) from public.event_guest_appearances a join awp on awp.id=a.event_id where a.source_label='AWPプログラム2026 全日分.pdf'),
    'venues_without_coordinates', (select count(*) from public.event_venues v join awp on awp.id=v.event_id where v.id like 'awp-2026-%' and (v.lat is null or v.lng is null)),
    'unresolved_stage_names', (select coalesce(jsonb_agg(performer_name_ja order by performer_name_ja),'[]'::jsonb) from unresolved),
    'voting_open', (select voting_open from public.event_vote_rules r join awp on awp.id=r.event_id),
    'official_device_ballots', (select count(*) from public.event_device_ballots b join awp on awp.id=b.event_id)
  ) as result
)
select result from summary;

select s.date, s.start_time, s.end_time, v.name_ja as venue,
       coalesce(p.stage_name, s.performer_name_ja,
         case when s.ranking_position is not null then '投票結果 ' || s.ranking_position || '位' end) as performer,
       s.performance_type, s.round_no, s.ranking_position
from public.event_slots s
join public.events e on e.id=s.event_id
join public.event_venues v on v.id=s.venue_id
left join public.performers p on p.id=s.performer_id
where e.slug='award-winning-performers-2026'
  and s.source_label='AWPプログラム2026 全日分.pdf'
order by s.date,s.start_time,v.sort_order;
