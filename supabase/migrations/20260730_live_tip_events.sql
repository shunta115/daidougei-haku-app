-- Live tip gift overlays (server-verified only via service role)

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

create index if not exists live_tip_events_performer_created_idx
  on public.live_tip_events (performer_id, created_at desc);

alter table public.live_tip_events enable row level security;

drop policy if exists live_tip_events_read on public.live_tip_events;
create policy live_tip_events_read on public.live_tip_events
  for select using (true);

-- Inserts only via service role (Stripe confirm/webhook). No client insert policy.

grant select on public.live_tip_events to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.live_tip_events;
  exception when duplicate_object then null;
  end;
end $$;
