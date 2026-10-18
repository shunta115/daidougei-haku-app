-- Additive settlement + payout ledger. No DROP / DELETE / TRUNCATE.
-- Does not rewrite historical tip/merch amounts. Does not change Connect accounts.

begin;
set local lock_timeout = '5s';

alter table public.tips
  add column if not exists stripe_fee_yen integer,
  add column if not exists net_after_stripe_yen integer,
  add column if not exists haku_fee_bps integer,
  add column if not exists haku_fee_yen integer,
  add column if not exists performer_share_yen integer,
  add column if not exists stripe_balance_transaction_id text,
  add column if not exists settlement_status text;

alter table public.merch_orders
  add column if not exists stripe_fee_yen integer,
  add column if not exists net_after_stripe_yen integer,
  add column if not exists haku_fee_bps integer,
  add column if not exists haku_fee_yen integer,
  add column if not exists performer_share_yen integer,
  add column if not exists stripe_balance_transaction_id text,
  add column if not exists settlement_status text;

create table if not exists public.performer_payouts (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers(id),
  connected_account_id text not null,
  amount_yen integer not null check (amount_yen >= 10000),
  status text not null check (status in ('reserved', 'paid', 'failed', 'canceled')),
  stripe_payout_id text,
  idempotency_key text not null unique,
  haku_available_yen integer,
  stripe_available_yen integer,
  eligible_yen integer,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists performer_payouts_one_open
  on public.performer_payouts (performer_id)
  where status = 'reserved';

create index if not exists performer_payouts_performer_created_idx
  on public.performer_payouts (performer_id, created_at desc);

alter table public.performer_payouts enable row level security;

drop policy if exists performer_payouts_self_read on public.performer_payouts;
create policy performer_payouts_self_read on public.performer_payouts
  for select using (auth.uid() = performer_id or public.is_admin());

grant select on public.performer_payouts to authenticated;

commit;
