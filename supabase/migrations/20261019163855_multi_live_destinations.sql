create table if not exists public.multi_live_destinations (
  performer_id uuid not null references public.performers(id) on delete cascade,
  provider text not null check (provider in ('youtube')),
  display_name text not null default 'YouTube LIVE' check (char_length(display_name) between 1 and 80),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  enabled boolean not null default true,
  encrypted_ingest text not null,
  encrypted_oauth text,
  egress_id text,
  status text not null default 'ready' check (status in ('ready', 'starting', 'live', 'failed', 'stopped')),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (performer_id, provider)
);

comment on table public.multi_live_destinations is
  'Server-only encrypted external LIVE destinations. Never expose through the browser Data API.';
comment on column public.multi_live_destinations.encrypted_ingest is
  'AES-256-GCM envelope encrypted by MULTI_LIVE_ENCRYPTION_KEY.';
comment on column public.multi_live_destinations.encrypted_oauth is
  'AES-256-GCM OAuth token envelope. External revenue remains outside HAKU Stripe ledgers.';

alter table public.multi_live_destinations enable row level security;
alter table public.multi_live_destinations force row level security;

revoke all on table public.multi_live_destinations from anon, authenticated;
grant select, insert, update, delete on table public.multi_live_destinations to service_role;

create index if not exists multi_live_destinations_active_egress_idx
  on public.multi_live_destinations (egress_id)
  where egress_id is not null;
