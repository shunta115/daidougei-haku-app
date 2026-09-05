-- Additive only. No DROP / DELETE / TRUNCATE / data overwrite.
-- Binds live_sessions to the featured event and marks timetable stream slots.
-- Safe if columns already exist. Run once in Supabase SQL Editor (full file).

begin;

alter table public.live_sessions
  add column if not exists event_id uuid references public.events (id) on delete set null;

alter table public.live_sessions
  add column if not exists venue_id text references public.event_venues (id) on delete set null;

create index if not exists live_sessions_event_idx
  on public.live_sessions (event_id);

create index if not exists live_sessions_venue_idx
  on public.live_sessions (venue_id);

alter table public.event_slots
  add column if not exists is_stream boolean not null default false;

commit;

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'live_sessions' and column_name = 'event_id'
  ) as live_sessions_event_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_slots' and column_name = 'is_stream'
  ) as event_slots_is_stream;
