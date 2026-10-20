-- The API uses service_role for sale-scoped reconciliation after the
-- security-definer sync/claim RPCs. RLS bypass alone does not grant PostgreSQL
-- table privileges, so grant only the server role the required access.
begin;

grant select, insert, update, delete
  on table public.performer_transfer_payables
  to service_role;

revoke all privileges
  on table public.performer_transfer_payables
  from anon;
revoke all privileges
  on table public.performer_transfer_payables
  from authenticated;
grant select
  on table public.performer_transfer_payables
  to authenticated;

commit;
