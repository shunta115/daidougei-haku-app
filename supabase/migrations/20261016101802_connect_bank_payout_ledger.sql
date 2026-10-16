-- Record connected-account bank payouts independently from HAKU Transfers.
-- A Stripe Payout can aggregate multiple Transfers, so it must not overwrite
-- the internal performer_payouts allocation/Transfer state.
begin;
set local lock_timeout = '5s';

create table if not exists public.connected_account_payouts (
  id uuid primary key default gen_random_uuid(),
  connected_account_id text not null,
  performer_id uuid references public.performers(id),
  stripe_payout_id text not null,
  amount_yen integer not null check (amount_yen >= 0),
  currency text not null default 'jpy',
  status text not null check (status in ('pending', 'paid', 'failed', 'canceled')),
  arrival_date timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connected_account_id, stripe_payout_id)
);

create index if not exists connected_account_payouts_performer_created_idx
  on public.connected_account_payouts (performer_id, created_at desc);

alter table public.connected_account_payouts enable row level security;
revoke all on public.connected_account_payouts from anon, authenticated;

comment on table public.connected_account_payouts is
  'Observed Stripe bank payouts for connected accounts. Independent from Connect Transfer allocation rows.';
comment on column public.connected_account_payouts.stripe_payout_id is
  'Stripe po_ object ID, scoped by connected_account_id.';

commit;
