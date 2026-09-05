-- Phase 1 missing pieces only.
-- Does not drop tables, functions, triggers, or rows.
-- Does not re-run 20260726 / 20260728 / 20260816.
-- Does not replace existing handle_new_user or is_admin.
-- Does not replace notify_* if they already exist.
-- Does not enable RLS / create policies / GRANT on tables that already existed.
-- Seed uses ON CONFLICT DO NOTHING (no overwrite).
-- Run the entire file in one go. Wrapped in a single transaction.

begin;

-- Snapshot which tables already exist (transaction-local). Used to avoid
-- touching RLS / policies / grants on pre-existing tables.
do $$
begin
  perform set_config('phase1.had_live_comments', (to_regclass('public.live_comments') is not null)::text, true);
  perform set_config('phase1.had_live_tip_events', (to_regclass('public.live_tip_events') is not null)::text, true);
  perform set_config('phase1.had_platform_settings', (to_regclass('public.platform_settings') is not null)::text, true);
  perform set_config('phase1.had_events', (to_regclass('public.events') is not null)::text, true);
  perform set_config('phase1.had_event_venues', (to_regclass('public.event_venues') is not null)::text, true);
  perform set_config('phase1.had_event_slots', (to_regclass('public.event_slots') is not null)::text, true);
  perform set_config('phase1.had_event_lineup', (to_regclass('public.event_lineup') is not null)::text, true);
  perform set_config('phase1.had_oshi', (to_regclass('public.oshi') is not null)::text, true);
  perform set_config('phase1.had_event_votes', (to_regclass('public.event_votes') is not null)::text, true);
  perform set_config('phase1.had_reports', (to_regclass('public.reports') is not null)::text, true);
end $$;

-- Fail closed: abort the whole transaction if required parents are missing
-- or typed differently, or if an optional table exists with missing columns.
do $$
declare
  r record;
  col text;
  missing text[];
  actual text;
begin
  foreach col in array array['profiles', 'performers', 'tips', 'live_sessions', 'notifications', 'follows']
  loop
    if to_regclass('public.' || col) is null then
      raise exception 'preflight abort: public.% is missing', col;
    end if;
  end loop;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ) then
    raise exception 'preflight abort: type public.user_role is missing';
  end if;

  if current_setting('server_version_num')::int < 120000 then
    raise exception 'preflight abort: PostgreSQL 12+ required for transactional enum add';
  end if;

  for r in
    select * from (values
      ('profiles', 'id', 'uuid'),
      ('performers', 'id', 'uuid'),
      ('performers', 'stage_name', 'text'),
      ('tips', 'id', 'uuid'),
      ('live_sessions', 'id', 'uuid'),
      ('notifications', 'user_id', 'uuid'),
      ('notifications', 'title', 'text'),
      ('notifications', 'body', 'text'),
      ('notifications', 'link', 'text'),
      ('follows', 'fan_id', 'uuid'),
      ('follows', 'performer_id', 'uuid')
    ) as t(table_name, column_name, expected_udt)
  loop
    select c.udt_name into actual
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = r.table_name
      and c.column_name = r.column_name;
    if actual is null then
      raise exception 'preflight abort: public.%.% is missing', r.table_name, r.column_name;
    end if;
    if actual <> r.expected_udt then
      raise exception 'preflight abort: public.%.% is %, expected %', r.table_name, r.column_name, actual, r.expected_udt;
    end if;
  end loop;

  -- Optional additive columns: if present, type must match
  for r in
    select * from (values
      ('performers', 'live_title', 'text'),
      ('performers', 'video_url', 'text'),
      ('performers', 'awards', 'text'),
      ('performers', 'appearances', 'text'),
      ('performers', 'sns_json', 'jsonb'),
      ('live_sessions', 'title', 'text'),
      ('live_sessions', 'viewer_peak', 'int4')
    ) as t(table_name, column_name, expected_udt)
  loop
    select c.udt_name into actual
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = r.table_name
      and c.column_name = r.column_name;
    if actual is not null and actual <> r.expected_udt then
      raise exception 'preflight abort: public.%.% is %, expected %', r.table_name, r.column_name, actual, r.expected_udt;
    end if;
  end loop;

  for r in
    select * from (values
      ('live_comments', array['id','performer_id','live_session_id','user_id','display_name','body','created_at']),
      ('live_tip_events', array['id','tip_id','performer_id','amount_cents','tier','created_at']),
      ('platform_settings', array['key','value']),
      ('events', array['id','slug','name_ja','name_en','presenter_ja','presenter_en','date_label','place_label','hours_label','weather_note_ja','weather_note_en','starts_on','ends_on','status','is_featured']),
      ('event_venues', array['id','event_id','name_ja','name_en','lat','lng','sort_order']),
      ('event_slots', array['id','event_id','venue_id','date','start_time','end_time']),
      ('event_lineup', array['event_id','performer_id']),
      ('oshi', array['fan_id','performer_id']),
      ('event_votes', array['event_id','performer_id','fan_id']),
      ('reports', array['id','target_type','target_id','reason','status'])
    ) as t(table_name, cols)
  loop
    if to_regclass('public.' || r.table_name) is null then
      continue;
    end if;
    missing := array[]::text[];
    foreach col in array r.cols
    loop
      if not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = r.table_name
          and c.column_name = col
      ) then
        missing := missing || col;
      end if;
    end loop;
    if coalesce(array_length(missing, 1), 0) > 0 then
      raise exception 'preflight abort: public.% exists but missing columns: %', r.table_name, array_to_string(missing, ', ');
    end if;
  end loop;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    raise exception 'preflight abort: public.handle_new_user is missing; refusing to continue';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    raise exception 'preflight abort: public.is_admin is missing; refusing to continue';
  end if;
end $$;

-- Extra live / profile columns (no-op if present)
alter table public.performers
  add column if not exists live_title text,
  add column if not exists video_url text,
  add column if not exists awards text not null default '',
  add column if not exists appearances text not null default '',
  add column if not exists sns_json jsonb not null default '[]'::jsonb;

alter table public.live_sessions
  add column if not exists title text,
  add column if not exists viewer_peak integer not null default 0;

-- Organizer enum value only (not used by functions in this script)
do $$
begin
  alter type public.user_role add value 'organizer';
exception
  when duplicate_object then null;
end $$;

-- Live comments / tip overlays (IF NOT EXISTS)
create table if not exists public.live_comments (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers (id) on delete cascade,
  live_session_id uuid references public.live_sessions (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null default 'Fan',
  body text not null check (char_length(body) > 0 and char_length(body) <= 200),
  created_at timestamptz not null default now()
);

do $$
begin
  if current_setting('phase1.had_live_comments', true) <> 'true' then
    execute 'create index if not exists live_comments_performer_created_idx on public.live_comments (performer_id, created_at desc)';
    execute 'alter table public.live_comments enable row level security';
  end if;
end $$;

create table if not exists public.live_tip_events (
  id uuid primary key default gen_random_uuid(),
  tip_id uuid not null unique references public.tips (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  live_session_id uuid references public.live_sessions (id) on delete set null,
  fan_id uuid references public.profiles (id) on delete set null,
  display_name text not null default '匿名',
  avatar_url text,
  amount_cents integer not null check (amount_cents > 0),
  gift_label text not null default '投げ銭',
  is_anonymous boolean not null default false,
  tier text not null default 'normal' check (tier in ('normal', 'premium', 'special')),
  created_at timestamptz not null default now()
);

do $$
begin
  if current_setting('phase1.had_live_tip_events', true) <> 'true' then
    execute 'create index if not exists live_tip_events_performer_created_idx on public.live_tip_events (performer_id, created_at desc)';
    execute 'alter table public.live_tip_events enable row level security';
  end if;
end $$;

-- Event / oshi / votes / settings (Phase 1)
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value)
values ('tip_fee_bps', '1000'::jsonb)
on conflict (key) do nothing;

do $$
begin
  if current_setting('phase1.had_platform_settings', true) <> 'true' then
    execute 'alter table public.platform_settings enable row level security';
  end if;
end $$;

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

do $$
begin
  if current_setting('phase1.had_events', true) <> 'true' then
    execute 'alter table public.events enable row level security';
  end if;
  if current_setting('phase1.had_event_venues', true) <> 'true' then
    execute 'alter table public.event_venues enable row level security';
  end if;
  if current_setting('phase1.had_event_slots', true) <> 'true' then
    execute 'alter table public.event_slots enable row level security';
  end if;
  if current_setting('phase1.had_event_lineup', true) <> 'true' then
    execute 'alter table public.event_lineup enable row level security';
  end if;
end $$;

create table if not exists public.oshi (
  fan_id uuid not null references public.profiles (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fan_id, performer_id)
);

do $$
begin
  if current_setting('phase1.had_oshi', true) <> 'true' then
    execute 'alter table public.oshi enable row level security';
  end if;
end $$;

create table if not exists public.event_votes (
  event_id uuid not null references public.events (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  fan_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, fan_id)
);

do $$
begin
  if current_setting('phase1.had_event_votes', true) <> 'true' then
    execute 'create index if not exists event_votes_performer_idx on public.event_votes (event_id, performer_id)';
    execute 'alter table public.event_votes enable row level security';
  end if;
end $$;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'closed')),
  created_at timestamptz not null default now()
);

do $$
begin
  if current_setting('phase1.had_reports', true) <> 'true' then
    execute 'alter table public.reports enable row level security';
  end if;
end $$;

-- Policies: create only when the table is new to this run (no DROP POLICY)
do $$
begin
  if current_setting('phase1.had_live_comments', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'live_comments' and policyname = 'live_comments_read') then
      execute 'create policy live_comments_read on public.live_comments for select using (true)';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'live_comments' and policyname = 'live_comments_insert') then
      execute 'create policy live_comments_insert on public.live_comments for insert with check (auth.uid() = user_id)';
    end if;
  end if;

  if current_setting('phase1.had_live_tip_events', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'live_tip_events' and policyname = 'live_tip_events_read') then
      execute 'create policy live_tip_events_read on public.live_tip_events for select using (true)';
    end if;
  end if;

  if current_setting('phase1.had_platform_settings', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_settings' and policyname = 'platform_settings_read') then
      execute 'create policy platform_settings_read on public.platform_settings for select using (true)';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_settings' and policyname = 'platform_settings_admin_write') then
      execute 'create policy platform_settings_admin_write on public.platform_settings for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  if current_setting('phase1.had_events', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'events_public_read') then
      execute 'create policy events_public_read on public.events for select using (status = ''published'' or public.is_admin())';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'events_admin_write') then
      execute 'create policy events_admin_write on public.events for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  if current_setting('phase1.had_event_venues', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_venues' and policyname = 'event_venues_public_read') then
      execute $p$create policy event_venues_public_read on public.event_venues for select using (
        exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.is_admin()))
      )$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_venues' and policyname = 'event_venues_admin_write') then
      execute 'create policy event_venues_admin_write on public.event_venues for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  if current_setting('phase1.had_event_slots', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_slots' and policyname = 'event_slots_public_read') then
      execute $p$create policy event_slots_public_read on public.event_slots for select using (
        exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.is_admin()))
      )$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_slots' and policyname = 'event_slots_admin_write') then
      execute 'create policy event_slots_admin_write on public.event_slots for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  if current_setting('phase1.had_event_lineup', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_lineup' and policyname = 'event_lineup_public_read') then
      execute $p$create policy event_lineup_public_read on public.event_lineup for select using (
        exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.is_admin()))
      )$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_lineup' and policyname = 'event_lineup_admin_write') then
      execute 'create policy event_lineup_admin_write on public.event_lineup for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  if current_setting('phase1.had_oshi', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oshi' and policyname = 'oshi_read') then
      execute 'create policy oshi_read on public.oshi for select using (fan_id = auth.uid() or performer_id = auth.uid() or public.is_admin())';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oshi' and policyname = 'oshi_insert') then
      execute 'create policy oshi_insert on public.oshi for insert with check (fan_id = auth.uid())';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'oshi' and policyname = 'oshi_delete') then
      execute 'create policy oshi_delete on public.oshi for delete using (fan_id = auth.uid() or public.is_admin())';
    end if;
  end if;

  if current_setting('phase1.had_event_votes', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_votes' and policyname = 'event_votes_read') then
      execute 'create policy event_votes_read on public.event_votes for select using (true)';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_votes' and policyname = 'event_votes_insert') then
      execute 'create policy event_votes_insert on public.event_votes for insert with check (fan_id = auth.uid())';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_votes' and policyname = 'event_votes_delete_own') then
      execute 'create policy event_votes_delete_own on public.event_votes for delete using (fan_id = auth.uid() or public.is_admin())';
    end if;
  end if;

  if current_setting('phase1.had_reports', true) <> 'true' then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_insert') then
      execute 'create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid())';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_admin') then
      execute 'create policy reports_admin on public.reports for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;
end $$;

-- GRANT only on tables created in this run
do $$
begin
  if current_setting('phase1.had_live_comments', true) <> 'true' then
    execute 'grant select, insert on public.live_comments to authenticated';
    execute 'grant select on public.live_comments to anon';
  end if;
  if current_setting('phase1.had_live_tip_events', true) <> 'true' then
    execute 'grant select on public.live_tip_events to anon, authenticated';
  end if;
  if current_setting('phase1.had_platform_settings', true) <> 'true' then
    execute 'grant select on public.platform_settings to anon, authenticated';
    execute 'grant insert, update, delete on public.platform_settings to authenticated';
  end if;
  if current_setting('phase1.had_events', true) <> 'true' then
    execute 'grant select on public.events to anon, authenticated';
    execute 'grant insert, update, delete on public.events to authenticated';
  end if;
  if current_setting('phase1.had_event_venues', true) <> 'true' then
    execute 'grant select on public.event_venues to anon, authenticated';
    execute 'grant insert, update, delete on public.event_venues to authenticated';
  end if;
  if current_setting('phase1.had_event_slots', true) <> 'true' then
    execute 'grant select on public.event_slots to anon, authenticated';
    execute 'grant insert, update, delete on public.event_slots to authenticated';
  end if;
  if current_setting('phase1.had_event_lineup', true) <> 'true' then
    execute 'grant select on public.event_lineup to anon, authenticated';
    execute 'grant insert, update, delete on public.event_lineup to authenticated';
  end if;
  if current_setting('phase1.had_oshi', true) <> 'true' then
    execute 'grant select, insert, delete on public.oshi to authenticated';
    execute 'grant select on public.oshi to anon';
  end if;
  if current_setting('phase1.had_event_votes', true) <> 'true' then
    execute 'grant select on public.event_votes to anon, authenticated';
    execute 'grant insert, delete on public.event_votes to authenticated';
  end if;
  if current_setting('phase1.had_reports', true) <> 'true' then
    execute 'grant insert on public.reports to authenticated';
    execute 'grant select, update, delete on public.reports to authenticated';
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.performers;
  exception when duplicate_object then null;
  end;
  if current_setting('phase1.had_live_comments', true) <> 'true' then
    begin
      alter publication supabase_realtime add table public.live_comments;
    exception when duplicate_object then null;
    end;
  end if;
  if current_setting('phase1.had_live_tip_events', true) <> 'true' then
    begin
      alter publication supabase_realtime add table public.live_tip_events;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Create notify functions only when missing. Never replace.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_followers_live_start'
  ) then
    raise notice 'skip notify_followers_live_start: already exists';
  else
    execute $f$
      create function public.notify_followers_live_start(
        p_performer_id uuid,
        p_stage_name text,
        p_title text default null
      )
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
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
      $body$;
    $f$;
    execute 'revoke all on function public.notify_followers_live_start(uuid, text, text) from public';
    execute 'grant execute on function public.notify_followers_live_start(uuid, text, text) to authenticated';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_event_appearances'
  ) then
    raise notice 'skip notify_event_appearances: already exists';
  else
    execute $f$
      create function public.notify_event_appearances(p_event_id uuid)
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        ev_name text;
      begin
        if not public.is_admin() then
          raise exception 'not allowed';
        end if;

        select name_ja into ev_name from public.events where id = p_event_id;
        if ev_name is null then
          raise exception 'event not found';
        end if;

        insert into public.notifications (user_id, title, body, link)
        select distinct audience.user_id,
          '出演情報',
          coalesce(p.stage_name, 'パフォーマー') || ' が「' || ev_name || '」に出演します',
          'profile:' || el.performer_id::text
        from public.event_lineup el
        join public.performers p on p.id = el.performer_id
        cross join lateral (
          select fan_id as user_id from public.follows where performer_id = el.performer_id
          union
          select fan_id as user_id from public.oshi where performer_id = el.performer_id
        ) audience
        where el.event_id = p_event_id;
      end;
      $body$;
    $f$;
    execute 'revoke all on function public.notify_event_appearances(uuid) from public';
    execute 'grant execute on function public.notify_event_appearances(uuid) to authenticated';
  end if;
end $$;

-- Seed featured event / venue only. No performers. No timetable slots. No overwrite.
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
on conflict (slug) do nothing;

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
on conflict (id) do nothing;

commit;

-- Expected result set (after commit)
select
  to_regclass('public.events') is not null as events,
  to_regclass('public.event_venues') is not null as event_venues,
  to_regclass('public.event_slots') is not null as event_slots,
  to_regclass('public.event_lineup') is not null as event_lineup,
  to_regclass('public.oshi') is not null as oshi,
  to_regclass('public.event_votes') is not null as event_votes,
  to_regclass('public.live_comments') is not null as live_comments,
  to_regclass('public.live_tip_events') is not null as live_tip_events,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_followers_live_start') > 0 as notify_live_start,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_event_appearances') > 0 as notify_appearances,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user') > 0 as handle_new_user,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin') > 0 as is_admin;

select slug, name_ja, date_label, place_label, starts_on, ends_on, is_featured, status
from public.events
where slug = 'award-winning-performers-2026';

select id, name_ja, lat, lng
from public.event_venues
where id = 'nerima-joshi-park';
