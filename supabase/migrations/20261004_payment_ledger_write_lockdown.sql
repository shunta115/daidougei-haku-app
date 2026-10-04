-- Payment ledger writes are server-only. Additive permission hardening only:
-- no row data changes, no table/column changes, no payment reprocessing.

begin;
set local lock_timeout = '5s';

-- Checkout creation/finalization uses the server service-role client. End users
-- must not be able to manufacture or mutate financial ledger rows directly.
revoke insert, update, delete on table public.tips from anon, authenticated;
drop policy if exists tips_insert_fan on public.tips;

-- Keep admin reads and server writes intact. The service role bypasses RLS.
revoke insert, update, delete on table public.merch_orders from anon, authenticated;
revoke insert, update, delete on table public.performer_payouts from anon, authenticated;
revoke insert, update, delete on table public.stripe_webhook_events from anon, authenticated;

commit;
