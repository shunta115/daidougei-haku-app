-- Additive LIVE presence tracking. No existing rows are deleted or rewritten.
alter table public.live_sessions
  add column if not exists heartbeat_at timestamptz default now(),
  add column if not exists ended_reason text;

create index if not exists live_sessions_open_heartbeat_idx
  on public.live_sessions (heartbeat_at)
  where ended_at is null;

comment on column public.live_sessions.heartbeat_at is
  'Last authenticated host heartbeat. Open sessions older than the server threshold are stale.';

comment on column public.live_sessions.ended_reason is
  'How the session ended, for example host, heartbeat_timeout, or admin_forced.';
