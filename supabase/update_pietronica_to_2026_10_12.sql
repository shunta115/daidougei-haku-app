-- One-row AWP 2026 schedule correction.
-- Moves ピエトロニカ statue/roving from 2026-10-11 to 2026-10-12.
-- Does not change performer links, sort_order, source_key, or other appearances.

begin;
set local lock_timeout = '5s';

update public.event_guest_appearances a
set appearance_date = date '2026-10-12'
from public.events e
where e.id = a.event_id
  and e.slug = 'award-winning-performers-2026'
  and a.id = '33d90dbf-e094-4332-878c-d6462c06ada0'
  and a.official_name_ja = 'ピエトロニカ'
  and a.appearance_type = 'statue_roving'
  and a.appearance_date = date '2026-10-11'
  and a.source_key = 'awp-2026-2026-10-11-appearance-10';

commit;

select a.official_name_ja, a.appearance_type, a.appearance_date, a.linked_performer_id, a.sort_order, a.source_key
from public.event_guest_appearances a
join public.events e on e.id = a.event_id
where e.slug = 'award-winning-performers-2026'
  and a.official_name_ja = 'ピエトロニカ';
