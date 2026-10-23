-- Remove Supabase default table privileges that are broader than the ledger UI
-- requires. RLS remains the row-level boundary; authenticated performers only
-- need SELECT on their own payable rows, and audit events are admin-readable.
begin;

revoke all privileges on table public.performer_transfer_payables from anon, authenticated;
grant select on table public.performer_transfer_payables to authenticated;

revoke all privileges on table public.payout_audit_events from anon, authenticated;
grant select on table public.payout_audit_events to authenticated;

revoke all privileges on table public.connected_account_payouts from anon, authenticated;

commit;
