-- Daidougei Haku 2026 event seed template.
-- Non-destructive by default: this file ends with ROLLBACK.
-- Replace TODO rows, run, inspect the summary, then change the final ROLLBACK to COMMIT only when ready.

begin;

create temp table seed_venues (
  venue_id text primary key,
  name_ja text not null,
  name_en text not null,
  blurb_ja text not null default '',
  blurb_en text not null default '',
  lat double precision,
  lng double precision,
  sort_order integer not null
) on commit drop;

insert into seed_venues values
  ('nerima-joshi-park-main', 'TODO_STAGE_NAME', 'TODO_STAGE_NAME_EN', '', '', 35.7508, 139.6375, 10);

create temp table seed_lineup (
  performer_email text primary key,
  sort_order integer not null
) on commit drop;

insert into seed_lineup values
  ('performer@example.com', 10);

create temp table seed_slots (
  performer_email text,
  venue_id text not null,
  slot_date date not null,
  start_time text not null,
  end_time text not null,
  stage_ja text not null default '',
  stage_en text not null default '',
  note_ja text not null default '',
  note_en text not null default '',
  is_stream boolean not null default false
) on commit drop;

insert into seed_slots values
  ('performer@example.com', 'nerima-joshi-park-main', '2026-10-10', '11:00', '11:30', 'TODO_STAGE_NAME', 'TODO_STAGE_NAME_EN', '', '', false);

create temp table seed_merch_products (
  seller_email text not null,
  name text not null,
  description text not null default '',
  image_url text,
  price_yen integer not null,
  stock integer not null,
  status text not null default 'draft'
) on commit drop;

insert into seed_merch_products values
  ('goods@example.com', 'TODO_PRODUCT_NAME', '', null, 1000, 10, 'draft');

do $$
begin
  if exists (
    select 1 from (
      select venue_id::text as value from seed_venues
      union all select name_ja from seed_venues
      union all select name_en from seed_venues
      union all select performer_email from seed_lineup
      union all select coalesce(performer_email, '') from seed_slots
      union all select stage_ja from seed_slots
      union all select stage_en from seed_slots
      union all select seller_email from seed_merch_products
      union all select name from seed_merch_products
    ) values_to_check
    where value like 'TODO_%'
       or value in ('performer@example.com', 'goods@example.com')
  ) then
    raise exception 'seed template still contains placeholder values';
  end if;
end $$;

insert into public.events (
  slug, name_ja, name_en, presenter_ja, presenter_en,
  date_label, place_label, hours_label, weather_note_ja, weather_note_en,
  starts_on, ends_on, status, is_featured
)
values (
  'award-winning-performers-2026',
  '受賞者たち',
  'Award Winning Performers',
  'Presented by 大道芸博 2026',
  'Presented by Daidougei Haku 2026',
  '10.10-10.12',
  '東京 練馬城址公園',
  '',
  '雨天・荒天時は公式案内を確認してください。',
  'Check official updates for weather changes.',
  '2026-10-10',
  '2026-10-12',
  'published',
  true
)
on conflict (slug) do update set
  name_ja = excluded.name_ja,
  name_en = excluded.name_en,
  presenter_ja = excluded.presenter_ja,
  presenter_en = excluded.presenter_en,
  date_label = excluded.date_label,
  place_label = excluded.place_label,
  hours_label = excluded.hours_label,
  weather_note_ja = excluded.weather_note_ja,
  weather_note_en = excluded.weather_note_en,
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  status = excluded.status,
  is_featured = excluded.is_featured,
  updated_at = now();

insert into public.event_venues (id, event_id, name_ja, name_en, blurb_ja, blurb_en, lat, lng, sort_order)
select v.venue_id, e.id, v.name_ja, v.name_en, v.blurb_ja, v.blurb_en, v.lat, v.lng, v.sort_order
from seed_venues v
cross join public.events e
where e.slug = 'award-winning-performers-2026'
on conflict (id) do update set
  name_ja = excluded.name_ja,
  name_en = excluded.name_en,
  blurb_ja = excluded.blurb_ja,
  blurb_en = excluded.blurb_en,
  lat = excluded.lat,
  lng = excluded.lng,
  sort_order = excluded.sort_order;

do $$
declare
  missing text[];
begin
  select array_agg(l.performer_email)
  into missing
  from seed_lineup l
  left join public.profiles pr on pr.email = l.performer_email
  left join public.performers p on p.id = pr.id
  where p.id is null or p.is_approved is not true;

  if coalesce(array_length(missing, 1), 0) > 0 then
    raise exception 'approved performer account missing for emails: %', array_to_string(missing, ', ');
  end if;
end $$;

insert into public.event_lineup (event_id, performer_id, sort_order)
select e.id, p.id, l.sort_order
from seed_lineup l
join public.profiles pr on pr.email = l.performer_email
join public.performers p on p.id = pr.id
cross join public.events e
where e.slug = 'award-winning-performers-2026'
on conflict (event_id, performer_id) do update set
  sort_order = excluded.sort_order;

insert into public.event_slots (
  event_id, venue_id, performer_id, date, start_time, end_time,
  stage_ja, stage_en, note_ja, note_en, is_stream
)
select
  e.id,
  s.venue_id,
  p.id,
  s.slot_date,
  s.start_time,
  s.end_time,
  s.stage_ja,
  s.stage_en,
  s.note_ja,
  s.note_en,
  s.is_stream
from seed_slots s
cross join public.events e
left join public.profiles pr on pr.email = s.performer_email
left join public.performers p on p.id = pr.id
where e.slug = 'award-winning-performers-2026'
  and exists (select 1 from public.event_venues v where v.id = s.venue_id and v.event_id = e.id)
  and not exists (
    select 1
    from public.event_slots existing
    where existing.event_id = e.id
      and existing.venue_id = s.venue_id
      and existing.date = s.slot_date
      and existing.start_time = s.start_time
      and existing.end_time = s.end_time
      and coalesce(existing.performer_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          coalesce(p.id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

insert into public.merch_products (
  seller_id, name, description, image_url, price_yen, stock, status
)
select p.id, m.name, m.description, m.image_url, m.price_yen, m.stock, m.status
from seed_merch_products m
join public.profiles pr on pr.email = m.seller_email
join public.performers p on p.id = pr.id
where p.is_approved is true
  and not exists (
    select 1
    from public.merch_products existing
    where existing.seller_id = p.id
      and existing.name = m.name
      and existing.status <> 'archived'
  );

select
  'summary' as section,
  (select count(*) from public.events where slug = 'award-winning-performers-2026') as events,
  (select count(*) from public.event_venues v join public.events e on e.id = v.event_id where e.slug = 'award-winning-performers-2026') as venues,
  (select count(*) from public.event_lineup l join public.events e on e.id = l.event_id where e.slug = 'award-winning-performers-2026') as lineup,
  (select count(*) from public.event_slots s join public.events e on e.id = s.event_id where e.slug = 'award-winning-performers-2026') as slots,
  (select count(*) from public.merch_products) as merch_products;

rollback;
