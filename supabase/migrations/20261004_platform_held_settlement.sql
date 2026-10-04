-- Move future HAKU sales to platform-held settlement.
-- Additive only: no historical payment, payout, performer, or Stripe account is changed.

begin;
set local lock_timeout = '5s';

alter table public.performer_payouts
  add column if not exists stripe_transfer_id text,
  add column if not exists funding_model text;

create unique index if not exists performer_payouts_stripe_transfer_uidx
  on public.performer_payouts (stripe_transfer_id)
  where stripe_transfer_id is not null;

comment on column public.performer_payouts.stripe_transfer_id is
  'Stripe Connect Transfer used by platform-held separate charges; not a bank payout ID.';

comment on column public.performer_payouts.funding_model is
  'Null for historical rows; platform_separate for transfers funded from the platform balance.';

-- Preserve server-only writes even if grants drifted after the earlier lockdown.
revoke insert, update, delete on table public.performer_payouts from anon, authenticated;

commit;
