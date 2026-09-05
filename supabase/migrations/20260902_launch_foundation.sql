-- Phase 1 launch foundation: events, oshi, votes, settings, organizer, extra profile fields.
-- Additive only. Does not drop tables or delete user data.

-- Organizer role (safe if already added)
do $$
begin
  alter type public.user_role add value 'organizer';
exception
  when duplicate_object then null;
end $$;

-- Extra performer profile fields
alter table public.performers
  add column if not exists video_url text,
  add column if not exists awards text not null default '',
  add column if not exists appearances text not null default '',
  add column if not exists sns_json jsonb not null default '[]'::jsonb;

-- Platform settings (tip fee etc.)
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value)
values ('tip_fee_bps', '1000'::jsonb)
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings
  for select using (true);

drop policy if exists platform_settings_admin_write on public.platform_settings;
create policy platform_settings_admin_write on public.platform_settings
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.platform_settings to anon, authenticated;
grant insert, update, delete on public.platform_settings to authenticated;

-- Featured / managed events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ja text not null,
  name_en text not null,
  presenter_ja text not null default '',
  presenter_en text not null default '',
  date_label text not null default '',
  place_label text not null default '',
  hours_label text not null default '',
  official_url text not null default '',
  weather_note_ja text not null default '',
  weather_note_en text not null default '',
  starts_on date,
  ends_on date,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_venues (
  id text primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  name_ja text not null,
  name_en text not null,
  blurb_ja text not null default '',
  blurb_en text not null default '',
  lat double precision,
  lng double precision,
  sort_order integer not null default 0
);

create table if not exists public.event_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  venue_id text not null references public.event_venues (id) on delete cascade,
  performer_id uuid references public.performers (id) on delete set null,
  date date not null,
  start_time text not null,
  end_time text not null,
  stage_ja text not null default '',
  stage_en text not null default '',
  status text not null default 'scheduled',
  note_ja text not null default '',
  note_en text not null default ''
);

create table if not exists public.event_lineup (
  event_id uuid not null references public.events (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (event_id, performer_id)
);

alter table public.events enable row level security;
alter table public.event_venues enable row level security;
alter table public.event_slots enable row level security;
alter table public.event_lineup enable row level security;

drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events
  for select using (status = 'published' or public.is_admin());
drop policy if exists events_admin_write on public.events;
create policy events_admin_write on public.events
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_venues_public_read on public.event_venues;
create policy event_venues_public_read on public.event_venues
  for select using (
    exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.is_admin()))
  );
drop policy if exists event_venues_admin_write on public.event_venues;
create policy event_venues_admin_write on public.event_venues
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_slots_public_read on public.event_slots;
create policy event_slots_public_read on public.event_slots
  for select using (
    exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.is_admin()))
  );
drop policy if exists event_slots_admin_write on public.event_slots;
create policy event_slots_admin_write on public.event_slots
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_lineup_public_read on public.event_lineup;
create policy event_lineup_public_read on public.event_lineup
  for select using (
    exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.is_admin()))
  );
drop policy if exists event_lineup_admin_write on public.event_lineup;
create policy event_lineup_admin_write on public.event_lineup
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.events, public.event_venues, public.event_slots, public.event_lineup to anon, authenticated;
grant insert, update, delete on public.events, public.event_venues, public.event_slots, public.event_lineup to authenticated;

-- Oshi (distinct from follows)
create table if not exists public.oshi (
  fan_id uuid not null references public.profiles (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fan_id, performer_id)
);

alter table public.oshi enable row level security;
drop policy if exists oshi_read on public.oshi;
create policy oshi_read on public.oshi
  for select using (fan_id = auth.uid() or performer_id = auth.uid() or public.is_admin());
drop policy if exists oshi_insert on public.oshi;
create policy oshi_insert on public.oshi
  for insert with check (fan_id = auth.uid());
drop policy if exists oshi_delete on public.oshi;
create policy oshi_delete on public.oshi
  for delete using (fan_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.oshi to authenticated;
grant select on public.oshi to anon;

-- Event votes: one vote per fan per event
create table if not exists public.event_votes (
  event_id uuid not null references public.events (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  fan_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, fan_id)
);

create index if not exists event_votes_performer_idx on public.event_votes (event_id, performer_id);

alter table public.event_votes enable row level security;
drop policy if exists event_votes_read on public.event_votes;
create policy event_votes_read on public.event_votes
  for select using (true);
drop policy if exists event_votes_insert on public.event_votes;
create policy event_votes_insert on public.event_votes
  for insert with check (fan_id = auth.uid());
drop policy if exists event_votes_delete_own on public.event_votes;
create policy event_votes_delete_own on public.event_votes
  for delete using (fan_id = auth.uid() or public.is_admin());

grant select on public.event_votes to anon, authenticated;
grant insert, delete on public.event_votes to authenticated;

-- Reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (reporter_id = auth.uid());
drop policy if exists reports_admin on public.reports;
create policy reports_admin on public.reports
  for all using (public.is_admin()) with check (public.is_admin());

grant insert on public.reports to authenticated;
grant select, update, delete on public.reports to authenticated;

-- Organizer inquiries (Phase 3 marketplace later)
create table if not exists public.booking_inquiries (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.booking_inquiries enable row level security;
drop policy if exists booking_inquiries_parties on public.booking_inquiries;
create policy booking_inquiries_parties on public.booking_inquiries
  for select using (organizer_id = auth.uid() or performer_id = auth.uid() or public.is_admin());
drop policy if exists booking_inquiries_insert on public.booking_inquiries;
create policy booking_inquiries_insert on public.booking_inquiries
  for insert with check (organizer_id = auth.uid());

grant select, insert on public.booking_inquiries to authenticated;

-- Push subscriptions (send in Phase 2)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, delete on public.push_subscriptions to authenticated;

-- Pitch spots placeholder (Phase 4)
create table if not exists public.pitch_spots (
  id uuid primary key default gen_random_uuid(),
  name_ja text not null,
  name_en text not null,
  country text not null default '',
  city text not null default '',
  notes text not null default '',
  lat double precision,
  lng double precision,
  published boolean not null default false
);

alter table public.pitch_spots enable row level security;
drop policy if exists pitch_spots_read on public.pitch_spots;
create policy pitch_spots_read on public.pitch_spots
  for select using (published = true or public.is_admin());
drop policy if exists pitch_spots_admin on public.pitch_spots;
create policy pitch_spots_admin on public.pitch_spots
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.pitch_spots to anon, authenticated;
grant insert, update, delete on public.pitch_spots to authenticated;

-- handle_new_user organizer support is in 20260903 (enum ADD VALUE cannot be used in the same transaction).

-- Live start notifies followers AND oshi
create or replace function public.notify_followers_live_start(
  p_performer_id uuid,
  p_stage_name text,
  p_title text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  body_text text;
begin
  if auth.uid() is null or auth.uid() <> p_performer_id then
    raise exception 'not allowed';
  end if;

  if p_title is not null and btrim(p_title) <> '' then
    body_text := coalesce(nullif(btrim(p_stage_name), ''), 'パフォーマー')
      || ' が「' || btrim(p_title) || '」を配信開始しました';
  else
    body_text := coalesce(nullif(btrim(p_stage_name), ''), 'パフォーマー')
      || ' がライブ配信を開始しました';
  end if;

  insert into public.notifications (user_id, title, body, link)
  select distinct audience.user_id, 'LIVE開始', body_text, 'live:' || p_performer_id::text
  from (
    select fan_id as user_id from public.follows where performer_id = p_performer_id
    union
    select fan_id as user_id from public.oshi where performer_id = p_performer_id
  ) audience;
end;
$$;

-- Seed featured event: 受賞者たち
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
  '10.10–10.12',
  '東京 練馬城址公園',
  '',
  '出演者情報・タイムテーブルは近日公開です。確定分から順次掲載します。',
  'Line-up and timetable coming soon. Confirmed acts will appear first.',
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
  weather_note_ja = excluded.weather_note_ja,
  weather_note_en = excluded.weather_note_en,
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  is_featured = true,
  status = 'published';

insert into public.event_venues (id, event_id, name_ja, name_en, blurb_ja, blurb_en, lat, lng, sort_order)
select
  'nerima-joshi-park',
  e.id,
  '練馬城址公園',
  'Nerima Joshi Park',
  '東京・練馬。受賞者たちの会場。',
  'Nerima, Tokyo. Home of Award Winning Performers.',
  35.7508,
  139.6375,
  0
from public.events e
where e.slug = 'award-winning-performers-2026'
on conflict (id) do update set
  name_ja = excluded.name_ja,
  name_en = excluded.name_en,
  lat = excluded.lat,
  lng = excluded.lng;
