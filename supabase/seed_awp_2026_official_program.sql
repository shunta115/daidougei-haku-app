-- Official AWP 2026 program import. Review, then run only after
-- 20261004_awp_official_program_support.sql succeeds.
-- Idempotent and additive: no UPDATE, DELETE, DROP or TRUNCATE.
begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from public.events where slug = 'award-winning-performers-2026') then
    raise exception 'AWP event not found';
  end if;
end $$;

with event_row as (
  select id from public.events where slug = 'award-winning-performers-2026'
), venue(id,name_ja,name_en,venue_type,sort_order) as (
  values
    ('awp-2026-stage-1','ステージ1','Stage 1','stage',10),
    ('awp-2026-stage-2','ステージ2','Stage 2','stage',20),
    ('awp-2026-stage-3','ステージ3','Stage 3','stage',30),
    ('awp-2026-stage-4','ステージ4','Stage 4','stage',40),
    ('awp-2026-statue-roving','Statue Carnival／回遊エリア','Statue Carnival / Roving Area','statue',50),
    ('awp-2026-food','キッチンカー／フードテント区域','Food Trucks / Food Tents','food',60),
    ('awp-2026-toshimaen-entrance','豊島園駅口','Toshimaen Station Entrance','other',70),
    ('awp-2026-warner-entrance','ワーナーブラザーズ方面入口','Warner Bros. Entrance','other',80)
)
insert into public.event_venues
  (id,event_id,name_ja,name_en,blurb_ja,blurb_en,lat,lng,sort_order,venue_type)
select venue.id,event_row.id,venue.name_ja,venue.name_en,'','',null,null,venue.sort_order,venue.venue_type
from event_row cross join venue
on conflict (id) do nothing;

with event_row as (
  select id from public.events where slug = 'award-winning-performers-2026'
), official(date,stage,start_time,end_time,performer_name_ja,round_no,performance_type,ranking_position,source_key) as (
values
  ('2026-10-10', '1', '10:10', '11:00', '紙磨呂', 1, 'regular', null, 'awp-2026-2026-10-10-1-10:10'),
  ('2026-10-10', '1', '11:00', '11:50', 'MUTSUKIN', 1, 'regular', null, 'awp-2026-2026-10-10-1-11:00'),
  ('2026-10-10', '1', '11:50', '12:40', 'エンジョイJoy', 1, 'regular', null, 'awp-2026-2026-10-10-1-11:50'),
  ('2026-10-10', '1', '12:40', '13:30', 'ポール', 2, 'regular', null, 'awp-2026-2026-10-10-1-12:40'),
  ('2026-10-10', '1', '13:30', '14:20', 'Entertainer MIKIYA', 2, 'regular', null, 'awp-2026-2026-10-10-1-13:30'),
  ('2026-10-10', '1', '14:20', '15:10', 'Performer 聖夜', 3, 'regular', null, 'awp-2026-2026-10-10-1-14:20'),
  ('2026-10-10', '1', '15:10', '16:00', 'Mr.↓YU↑', 3, 'regular', null, 'awp-2026-2026-10-10-1-15:10'),
  ('2026-10-10', '2', '10:30', '11:20', 'Performer 聖夜', 1, 'regular', null, 'awp-2026-2026-10-10-2-10:30'),
  ('2026-10-10', '2', '11:20', '12:10', '大道芸人ヒヨコ', 1, 'regular', null, 'awp-2026-2026-10-10-2-11:20'),
  ('2026-10-10', '2', '12:10', '13:00', '大道芸人ゆうた', 1, 'regular', null, 'awp-2026-2026-10-10-2-12:10'),
  ('2026-10-10', '2', '13:00', '13:50', 'MUTSUKIN', 2, 'regular', null, 'awp-2026-2026-10-10-2-13:00'),
  ('2026-10-10', '2', '13:50', '14:40', 'エンジョイJoy', 2, 'regular', null, 'awp-2026-2026-10-10-2-13:50'),
  ('2026-10-10', '2', '14:40', '15:30', 'ポール', 3, 'regular', null, 'awp-2026-2026-10-10-2-14:40'),
  ('2026-10-10', '2', '15:30', '16:20', 'Entertainer MIKIYA', 3, 'regular', null, 'awp-2026-2026-10-10-2-15:30'),
  ('2026-10-10', '3', '10:20', '11:10', 'ポール', 1, 'regular', null, 'awp-2026-2026-10-10-3-10:20'),
  ('2026-10-10', '3', '11:10', '12:00', 'Mr.↓YU↑', 1, 'regular', null, 'awp-2026-2026-10-10-3-11:10'),
  ('2026-10-10', '3', '12:00', '12:50', '紙磨呂', 2, 'regular', null, 'awp-2026-2026-10-10-3-12:00'),
  ('2026-10-10', '3', '12:50', '13:40', '大道芸人ヒヨコ', 2, 'regular', null, 'awp-2026-2026-10-10-3-12:50'),
  ('2026-10-10', '3', '13:40', '14:30', '大道芸人ゆうた', 2, 'regular', null, 'awp-2026-2026-10-10-3-13:40'),
  ('2026-10-10', '3', '14:30', '15:20', 'MUTSUKIN', 3, 'regular', null, 'awp-2026-2026-10-10-3-14:30'),
  ('2026-10-10', '3', '15:20', '16:10', 'エンジョイJoy', 3, 'regular', null, 'awp-2026-2026-10-10-3-15:20'),
  ('2026-10-10', '4', '10:50', '11:40', 'Entertainer MIKIYA', 1, 'regular', null, 'awp-2026-2026-10-10-4-10:50'),
  ('2026-10-10', '4', '11:40', '12:30', 'Performer 聖夜', 2, 'regular', null, 'awp-2026-2026-10-10-4-11:40'),
  ('2026-10-10', '4', '12:30', '13:20', 'Mr.↓YU↑', 2, 'regular', null, 'awp-2026-2026-10-10-4-12:30'),
  ('2026-10-10', '4', '13:20', '14:10', '紙磨呂', 3, 'regular', null, 'awp-2026-2026-10-10-4-13:20'),
  ('2026-10-10', '4', '14:10', '15:00', '大道芸人ヒヨコ', 3, 'regular', null, 'awp-2026-2026-10-10-4-14:10'),
  ('2026-10-10', '4', '15:00', '15:50', '大道芸人ゆうた', 3, 'regular', null, 'awp-2026-2026-10-10-4-15:00'),
  ('2026-10-11', '1', '10:10', '11:00', '大道芸人ジーニー', 1, 'regular', null, 'awp-2026-2026-10-11-1-10:10'),
  ('2026-10-11', '1', '11:00', '11:50', 'エンジョイJoy', 1, 'regular', null, 'awp-2026-2026-10-11-1-11:00'),
  ('2026-10-11', '1', '11:50', '12:40', '福井陽翔人', 1, 'regular', null, 'awp-2026-2026-10-11-1-11:50'),
  ('2026-10-11', '1', '12:40', '13:30', '大道芸人ゆうた', 2, 'regular', null, 'awp-2026-2026-10-11-1-12:40'),
  ('2026-10-11', '1', '13:30', '14:20', 'MUTSUKIN', 2, 'regular', null, 'awp-2026-2026-10-11-1-13:30'),
  ('2026-10-11', '1', '15:10', '16:00', 'Mr.↓YU↑', 3, 'regular', null, 'awp-2026-2026-10-11-1-15:10'),
  ('2026-10-11', '2', '10:30', '11:20', '大道芸人ゆうた', 1, 'regular', null, 'awp-2026-2026-10-11-2-10:30'),
  ('2026-10-11', '2', '11:20', '12:10', 'Mr.↓YU↑', 1, 'regular', null, 'awp-2026-2026-10-11-2-11:20'),
  ('2026-10-11', '2', '12:10', '13:00', 'ポール', 1, 'regular', null, 'awp-2026-2026-10-11-2-12:10'),
  ('2026-10-11', '2', '13:00', '13:50', 'エンジョイJoy', 2, 'regular', null, 'awp-2026-2026-10-11-2-13:00'),
  ('2026-10-11', '2', '13:50', '14:40', '福井陽翔人', 2, 'regular', null, 'awp-2026-2026-10-11-2-13:50'),
  ('2026-10-11', '2', '14:40', '15:30', '大道芸人ジーニー', 3, 'regular', null, 'awp-2026-2026-10-11-2-14:40'),
  ('2026-10-11', '2', '15:30', '16:20', 'MUTSUKIN', 3, 'regular', null, 'awp-2026-2026-10-11-2-15:30'),
  ('2026-10-11', '3', '11:10', '12:00', 'MUTSUKIN', 1, 'regular', null, 'awp-2026-2026-10-11-3-11:10'),
  ('2026-10-11', '3', '12:50', '13:40', 'Mr.↓YU↑', 2, 'regular', null, 'awp-2026-2026-10-11-3-12:50'),
  ('2026-10-11', '3', '13:40', '14:30', 'ポール', 2, 'regular', null, 'awp-2026-2026-10-11-3-13:40'),
  ('2026-10-11', '3', '14:30', '15:20', '大道芸人ゆうた', 3, 'regular', null, 'awp-2026-2026-10-11-3-14:30'),
  ('2026-10-11', '3', '15:20', '16:10', '福井陽翔人', 3, 'regular', null, 'awp-2026-2026-10-11-3-15:20'),
  ('2026-10-11', '4', '11:40', '12:30', '大道芸人ジーニー', 2, 'regular', null, 'awp-2026-2026-10-11-4-11:40'),
  ('2026-10-11', '4', '14:10', '15:00', 'エンジョイJoy', 3, 'regular', null, 'awp-2026-2026-10-11-4-14:10'),
  ('2026-10-11', '4', '15:00', '15:50', 'ポール', 3, 'regular', null, 'awp-2026-2026-10-11-4-15:00'),
  ('2026-10-12', '1', '10:10', '11:00', 'ITSUZAI', 1, 'regular', null, 'awp-2026-2026-10-12-1-10:10'),
  ('2026-10-12', '1', '11:00', '11:50', 'ポール', 1, 'regular', null, 'awp-2026-2026-10-12-1-11:00'),
  ('2026-10-12', '1', '11:50', '12:40', '紙磨呂', 1, 'regular', null, 'awp-2026-2026-10-12-1-11:50'),
  ('2026-10-12', '1', '12:40', '13:30', 'Mr.↓YU↑', 2, 'regular', null, 'awp-2026-2026-10-12-1-12:40'),
  ('2026-10-12', '1', '13:30', '14:20', '大道芸人ジーニー', 2, 'regular', null, 'awp-2026-2026-10-12-1-13:30'),
  ('2026-10-12', '1', '14:20', '15:10', 'MUTSUKIN', 3, 'regular', null, 'awp-2026-2026-10-12-1-14:20'),
  ('2026-10-12', '1', '15:10', '16:00', 'エンジョイJoy', 3, 'regular', null, 'awp-2026-2026-10-12-1-15:10'),
  ('2026-10-12', '2', '10:30', '11:20', 'MUTSUKIN', 1, 'regular', null, 'awp-2026-2026-10-12-2-10:30'),
  ('2026-10-12', '2', '11:20', '12:10', '福井陽翔人', 1, 'regular', null, 'awp-2026-2026-10-12-2-11:20'),
  ('2026-10-12', '2', '12:10', '13:00', 'Entertainer MIKIYA', 1, 'regular', null, 'awp-2026-2026-10-12-2-12:10'),
  ('2026-10-12', '2', '13:00', '13:50', 'ポール', 2, 'regular', null, 'awp-2026-2026-10-12-2-13:00'),
  ('2026-10-12', '2', '13:50', '14:40', '紙磨呂', 2, 'regular', null, 'awp-2026-2026-10-12-2-13:50'),
  ('2026-10-12', '2', '14:40', '15:30', 'Mr.↓YU↑', 3, 'regular', null, 'awp-2026-2026-10-12-2-14:40'),
  ('2026-10-12', '2', '15:30', '16:20', '大道芸人ジーニー', 3, 'regular', null, 'awp-2026-2026-10-12-2-15:30'),
  ('2026-10-12', '3', '10:20', '11:10', 'Mr.↓YU↑', 1, 'regular', null, 'awp-2026-2026-10-12-3-10:20'),
  ('2026-10-12', '3', '11:10', '12:00', 'エンジョイJoy', 1, 'regular', null, 'awp-2026-2026-10-12-3-11:10'),
  ('2026-10-12', '3', '12:00', '12:50', 'ITSUZAI', 2, 'regular', null, 'awp-2026-2026-10-12-3-12:00'),
  ('2026-10-12', '3', '12:50', '13:40', '福井陽翔人', 2, 'regular', null, 'awp-2026-2026-10-12-3-12:50'),
  ('2026-10-12', '3', '13:40', '14:30', 'Entertainer MIKIYA', 2, 'regular', null, 'awp-2026-2026-10-12-3-13:40'),
  ('2026-10-12', '3', '14:30', '15:20', 'ポール', 3, 'regular', null, 'awp-2026-2026-10-12-3-14:30'),
  ('2026-10-12', '3', '15:20', '16:10', '紙磨呂', 3, 'regular', null, 'awp-2026-2026-10-12-3-15:20'),
  ('2026-10-12', '4', '10:50', '11:40', '大道芸人ジーニー', 1, 'regular', null, 'awp-2026-2026-10-12-4-10:50'),
  ('2026-10-12', '4', '11:40', '12:30', 'MUTSUKIN', 2, 'regular', null, 'awp-2026-2026-10-12-4-11:40'),
  ('2026-10-12', '4', '12:30', '13:20', 'エンジョイJoy', 2, 'regular', null, 'awp-2026-2026-10-12-4-12:30'),
  ('2026-10-12', '4', '13:20', '14:10', 'ITSUZAI', 3, 'regular', null, 'awp-2026-2026-10-12-4-13:20'),
  ('2026-10-12', '4', '14:10', '15:00', '福井陽翔人', 3, 'regular', null, 'awp-2026-2026-10-12-4-14:10'),
  ('2026-10-12', '4', '15:00', '15:50', 'Entertainer MIKIYA', 3, 'regular', null, 'awp-2026-2026-10-12-4-15:00'),
  ('2026-10-10', 'night', '16:30', '17:20', null, null, 'special_final', 3, 'awp-2026-2026-10-10-night-16:30'),
  ('2026-10-10', 'night', '17:20', '18:10', null, null, 'special_final', 2, 'awp-2026-2026-10-10-night-17:20'),
  ('2026-10-10', 'night', '18:10', '19:00', null, null, 'special_final', 1, 'awp-2026-2026-10-10-night-18:10'),
  ('2026-10-11', 'night', '16:30', '17:20', null, null, 'special_final', 3, 'awp-2026-2026-10-11-night-16:30'),
  ('2026-10-11', 'night', '17:20', '18:10', null, null, 'special_final', 2, 'awp-2026-2026-10-11-night-17:20'),
  ('2026-10-11', 'night', '18:10', '19:00', null, null, 'special_final', 1, 'awp-2026-2026-10-11-night-18:10'),
  ('2026-10-12', 'night', '16:30', '17:20', null, null, 'special_final', 3, 'awp-2026-2026-10-12-night-16:30'),
  ('2026-10-12', 'night', '17:20', '18:10', null, null, 'special_final', 2, 'awp-2026-2026-10-12-night-17:20'),
  ('2026-10-12', 'night', '18:10', '19:00', null, null, 'special_final', 1, 'awp-2026-2026-10-12-night-18:10')
), resolved as (
  select official.*,
    case
      when performer_name_ja = 'Mr.↓YU↑' then (select id from public.performers where stage_name = 'Mr.↓YU↑（ミスターユー）' limit 1)
      when performer_name_ja in ('MUTSUKIN','福井陽翔人') then (select id from public.performers where stage_name = performer_name_ja limit 1)
      else null
    end as performer_id
  from official
)
insert into public.event_slots
  (event_id,venue_id,performer_id,performer_name_ja,date,start_time,end_time,stage_ja,stage_en,status,note_ja,note_en,performance_type,round_no,ranking_position,source_key,source_label)
select event_row.id,
  case when resolved.stage = 'night' then 'awp-2026-stage-1' else 'awp-2026-stage-' || resolved.stage end,
  resolved.performer_id,resolved.performer_name_ja,resolved.date::date,resolved.start_time,resolved.end_time,
  case when resolved.stage = 'night' then 'NIGHT SPECIALSステージ' else 'ステージ' || resolved.stage end,
  case when resolved.stage = 'night' then 'Night Specials Stage' else 'Stage ' || resolved.stage end,
  'scheduled','','',resolved.performance_type,resolved.round_no,resolved.ranking_position,resolved.source_key,'AWPプログラム2026 全日分.pdf'
from event_row cross join resolved
on conflict (event_id,source_key) where source_key is not null do nothing;

with event_row as (
  select id from public.events where slug = 'award-winning-performers-2026'
), official(appearance_date,official_name_ja,appearance_type,source_key,sort_order) as (
values
  ('2026-10-10', 'CLOWN BELLA', 'statue_roving', 'awp-2026-2026-10-10-appearance-2', 2),
  ('2026-10-10', 'ドレミふぁ共和国', 'statue_roving', 'awp-2026-2026-10-10-appearance-3', 3),
  ('2026-10-10', 'アンドロイドールYuE', 'statue_roving', 'awp-2026-2026-10-10-appearance-4', 4),
  ('2026-10-10', '催眠術師じゅんいち', 'statue_roving', 'awp-2026-2026-10-10-appearance-5', 5),
  ('2026-10-11', 'Piro', 'statue_roving', 'awp-2026-2026-10-11-appearance-6', 6),
  ('2026-10-11', 'CLOWN BELLA', 'statue_roving', 'awp-2026-2026-10-11-appearance-7', 7),
  ('2026-10-11', 'ドレミふぁ共和国', 'statue_roving', 'awp-2026-2026-10-11-appearance-8', 8),
  ('2026-10-11', 'アンドロイドールYuE', 'statue_roving', 'awp-2026-2026-10-11-appearance-9', 9),
  ('2026-10-12', 'ピエトロニカ', 'statue_roving', 'awp-2026-2026-10-11-appearance-10', 10),
  ('2026-10-12', 'Piro', 'statue_roving', 'awp-2026-2026-10-12-appearance-11', 11),
  ('2026-10-12', 'ドレミふぁ共和国', 'statue_roving', 'awp-2026-2026-10-12-appearance-12', 12)
)
insert into public.event_guest_appearances
  (event_id,official_name_ja,appearance_type,appearance_date,linked_performer_id,source_key,source_label,sort_order)
select event_row.id,official.official_name_ja,official.appearance_type,official.appearance_date::date,
  case
    when official.official_name_ja = 'Piro' then (select id from public.performers where stage_name = 'Piro' limit 1)
    when official.official_name_ja = '催眠術師じゅんいち' then (select id from public.performers where stage_name = '催眠術師じゅんいち' limit 1)
    else null
  end,
  official.source_key,'AWPプログラム2026 全日分.pdf',official.sort_order
from event_row cross join official
on conflict (event_id,source_key) do nothing;

commit;

-- Expected after a first successful run: 8 venues from this source, 84 slots,
-- 11 statue/roving daily appearances. Coordinates remain NULL intentionally.
select
  (select count(*) from public.event_venues v join public.events e on e.id=v.event_id where e.slug='award-winning-performers-2026' and v.id like 'awp-2026-%') as imported_venues,
  (select count(*) from public.event_slots s join public.events e on e.id=s.event_id where e.slug='award-winning-performers-2026' and s.source_label='AWPプログラム2026 全日分.pdf') as imported_slots,
  (select count(*) from public.event_guest_appearances a join public.events e on e.id=a.event_id where e.slug='award-winning-performers-2026' and a.source_label='AWPプログラム2026 全日分.pdf') as imported_appearances;
