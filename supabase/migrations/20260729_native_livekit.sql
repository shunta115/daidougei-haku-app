-- Native LiveKit live: titles + comments + realtime

alter table public.performers
  add column if not exists live_title text;

alter table public.live_sessions
  add column if not exists title text,
  add column if not exists viewer_peak integer not null default 0;

create table if not exists public.live_comments (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers (id) on delete cascade,
  live_session_id uuid references public.live_sessions (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null default 'Fan',
  body text not null check (char_length(body) > 0 and char_length(body) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists live_comments_performer_created_idx
  on public.live_comments (performer_id, created_at desc);

alter table public.live_comments enable row level security;

drop policy if exists live_comments_read on public.live_comments;
create policy live_comments_read on public.live_comments
  for select using (true);

drop policy if exists live_comments_insert on public.live_comments;
create policy live_comments_insert on public.live_comments
  for insert with check (auth.uid() = user_id);

grant select, insert on public.live_comments to authenticated;
grant select on public.live_comments to anon;

-- Realtime for LIVE NOW + chat
do $$
begin
  begin
    alter publication supabase_realtime add table public.performers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.live_comments;
  exception when duplicate_object then null;
  end;
end $$;
