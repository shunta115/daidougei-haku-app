-- Same additive bind as supabase/phase1_live_bind.sql (repo history).
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
