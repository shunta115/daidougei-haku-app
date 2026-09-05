-- Additive only. No DROP / DELETE / TRUNCATE of existing product tables.
-- Ops foundation: product_events, daily snapshots, proposal queue, approvals, memories.
-- Run once in Supabase SQL Editor (full file). Safe if objects already exist.

begin;

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in (
    'view_home',
    'view_performer',
    'click_tip',
    'tip_start',
    'tip_success',
    'signup_start',
    'signup_complete',
    'follow',
    'vote',
    'live_view_start'
  )),
  session_id text not null,
  user_id uuid references public.profiles (id) on delete set null,
  performer_id uuid,
  event_id uuid,
  path text,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_created_idx on public.product_events (created_at desc);
create index if not exists product_events_name_created_idx on public.product_events (name, created_at desc);
create index if not exists product_events_session_idx on public.product_events (session_id);

create table if not exists public.ops_daily_snapshots (
  day date primary key,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_proposals (
  id uuid primary key default gen_random_uuid(),
  agent text not null check (agent in ('ceo', 'growth')),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'revised', 'rejected', 'superseded')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_proposals_status_idx on public.ops_proposals (status, created_at desc);

create table if not exists public.ops_approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ops_proposals (id) on delete cascade,
  admin_id uuid references public.profiles (id) on delete set null,
  decision text not null check (decision in ('approved', 'revised', 'rejected')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.ops_memories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('success', 'failure', 'decision')),
  summary text not null,
  why text not null default '',
  proposal_id uuid references public.ops_proposals (id) on delete set null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.product_events enable row level security;
alter table public.ops_daily_snapshots enable row level security;
alter table public.ops_proposals enable row level security;
alter table public.ops_approvals enable row level security;
alter table public.ops_memories enable row level security;

drop policy if exists product_events_insert on public.product_events;
create policy product_events_insert on public.product_events
  for insert with check (user_id is null or user_id = auth.uid());

drop policy if exists product_events_admin_read on public.product_events;
create policy product_events_admin_read on public.product_events
  for select using (public.is_admin());

drop policy if exists ops_daily_snapshots_admin on public.ops_daily_snapshots;
create policy ops_daily_snapshots_admin on public.ops_daily_snapshots
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ops_proposals_admin on public.ops_proposals;
create policy ops_proposals_admin on public.ops_proposals
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ops_approvals_admin on public.ops_approvals;
create policy ops_approvals_admin on public.ops_approvals
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ops_memories_admin on public.ops_memories;
create policy ops_memories_admin on public.ops_memories
  for all using (public.is_admin()) with check (public.is_admin());

grant insert on public.product_events to anon, authenticated;
grant select on public.product_events to authenticated;
grant select, insert, update on public.ops_daily_snapshots to authenticated;
grant select, insert, update on public.ops_proposals to authenticated;
grant select, insert on public.ops_approvals to authenticated;
grant select, insert on public.ops_memories to authenticated;

commit;

select
  to_regclass('public.product_events') is not null as product_events,
  to_regclass('public.ops_daily_snapshots') is not null as ops_daily_snapshots,
  to_regclass('public.ops_proposals') is not null as ops_proposals,
  to_regclass('public.ops_approvals') is not null as ops_approvals,
  to_regclass('public.ops_memories') is not null as ops_memories;
