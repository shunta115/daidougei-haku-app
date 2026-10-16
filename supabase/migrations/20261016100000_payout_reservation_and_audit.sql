-- Additive payout safety controls. This migration never rewrites sales or balances.
begin;
set local lock_timeout = '5s';

alter table public.performer_payouts
  add column if not exists transfer_status text,
  add column if not exists bank_payout_status text,
  add column if not exists transfer_completed_at timestamptz,
  add column if not exists last_reconciled_at timestamptz;

do $$ begin
  alter table public.performer_payouts add constraint performer_payouts_transfer_status_check
    check (transfer_status is null or transfer_status in ('pending','succeeded','needs_reconciliation','reversed','failed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.performer_payouts add constraint performer_payouts_bank_status_check
    check (bank_payout_status is null or bank_payout_status in ('not_started','pending','paid','failed','canceled'));
exception when duplicate_object then null; end $$;

create table if not exists public.payout_audit_events (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers(id),
  payout_id uuid references public.performer_payouts(id),
  event_type text not null,
  amount_yen integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payout_audit_events_performer_created_idx
  on public.payout_audit_events (performer_id, created_at desc);
alter table public.payout_audit_events enable row level security;
drop policy if exists payout_audit_admin_read on public.payout_audit_events;
create policy payout_audit_admin_read on public.payout_audit_events
  for select using (public.is_admin());
grant select on public.payout_audit_events to authenticated;
revoke insert, update, delete on public.payout_audit_events from anon, authenticated;

-- Keep the reservation-side calculation identical to the application ledger.
-- This is deliberately evaluated again inside the locked transaction so a
-- refund or dispute committed after the screen was loaded cannot be overpaid.
create or replace function public.payout_remaining_share_yen(
  p_status text,
  p_dispute_status text,
  p_performer_share_yen integer,
  p_gross_yen integer,
  p_stripe_fee_yen integer,
  p_haku_fee_bps integer,
  p_refunded_yen integer
) returns integer
language sql immutable set search_path = public as $$
  select case
    when coalesce(p_status, '') in ('pending','failed','expired','refunded') then 0
    when coalesce(p_dispute_status, '') not in ('','won','warning_closed') then 0
    when coalesce(p_performer_share_yen, 0) <= 0 or coalesce(p_gross_yen, 0) <= 0 then 0
    when coalesce(p_refunded_yen, 0) <= 0 then p_performer_share_yen
    when p_refunded_yen >= p_gross_yen then 0
    when p_stripe_fee_yen is not null and p_haku_fee_bps is not null then
      greatest(0,
        greatest(0, p_gross_yen - p_refunded_yen - greatest(0, p_stripe_fee_yen))
        - floor(
            greatest(0, p_gross_yen - p_refunded_yen - greatest(0, p_stripe_fee_yen))
            * greatest(0, p_haku_fee_bps)::numeric / 10000
          )::integer
      )
    else floor(
      p_performer_share_yen::numeric * (p_gross_yen - greatest(0, p_refunded_yen)) / p_gross_yen
    )::integer
  end
$$;

revoke all on function public.payout_remaining_share_yen(text,text,integer,integer,integer,integer,integer)
  from public, anon, authenticated;

create or replace function public.audit_performer_payout_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.payout_audit_events(performer_id, payout_id, event_type, amount_yen, metadata)
  values (
    new.performer_id, new.id,
    case when tg_op = 'INSERT' then 'reservation_created' else 'payout_state_changed' end,
    new.amount_yen,
    jsonb_build_object(
      'status', new.status,
      'transfer_status', new.transfer_status,
      'bank_payout_status', new.bank_payout_status,
      'has_transfer_id', new.stripe_transfer_id is not null,
      'has_bank_payout_id', new.stripe_payout_id is not null
    )
  );
  return new;
end $$;

drop trigger if exists performer_payout_audit_trigger on public.performer_payouts;
create trigger performer_payout_audit_trigger
after insert or update of status, transfer_status, bank_payout_status, stripe_transfer_id, stripe_payout_id
on public.performer_payouts for each row execute function public.audit_performer_payout_change();

create or replace function public.reserve_performer_payout(
  p_performer_id uuid,
  p_connected_account_id text,
  p_amount_yen integer,
  p_idempotency_key text,
  p_stripe_available_yen integer
) returns setof public.performer_payouts
language plpgsql security definer set search_path = public as $$
declare
  v_internal_unallocated integer;
  v_platform_unreserved integer;
  v_row public.performer_payouts;
begin
  if p_amount_yen < 10000 then raise exception 'minimum payout is 10000 JPY' using errcode = '22023'; end if;
  if coalesce(p_connected_account_id, '') !~ '^acct_' then raise exception 'invalid connected account' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.performers
    where id = p_performer_id and stripe_account_id = p_connected_account_id
  ) then
    raise exception 'connected account does not belong to performer' using errcode = '23514';
  end if;

  -- Serializes every reservation for this immutable performer ID.
  -- The global lock prevents two performers from reserving the same snapshot
  -- of the platform's transferable balance concurrently.
  perform pg_advisory_xact_lock(hashtextextended('haku-platform-transfer-reservation', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_performer_id::text, 0));
  if exists (select 1 from public.performer_payouts where performer_id = p_performer_id and status = 'reserved') then
    raise unique_violation using message = 'open payout already exists';
  end if;

  select greatest(0,
    coalesce((select sum(public.payout_remaining_share_yen(
        status,
        dispute_status,
        performer_share_yen,
        coalesce(gross_amount_yen, amount_cents),
        stripe_fee_yen,
        haku_fee_bps,
        refunded_amount_yen
      )) from public.tips
      where performer_id = p_performer_id and stripe_session_id like 'cs_live_%'
        and stripe_checkout_mode = 'platform_separate'
        and settlement_status = 'settled'), 0)
    + coalesce((select sum(public.payout_remaining_share_yen(
        status,
        dispute_status,
        performer_share_yen,
        coalesce(gross_amount_yen, amount_yen),
        stripe_fee_yen,
        haku_fee_bps,
        refunded_amount_yen
      )) from public.merch_orders
      where seller_id = p_performer_id and stripe_session_id like 'cs_live_%'
        and stripe_checkout_mode = 'platform_separate'
        and settlement_status = 'settled'), 0)
    - coalesce((select sum(amount_yen) from public.performer_payouts
      where performer_id = p_performer_id and status in ('reserved','paid')), 0)
  ) into v_internal_unallocated;

  select greatest(0, coalesce(p_stripe_available_yen, 0) - coalesce(sum(amount_yen), 0))
    into v_platform_unreserved
    from public.performer_payouts where status = 'reserved';

  if p_amount_yen > v_internal_unallocated or p_amount_yen > v_platform_unreserved then
    raise exception 'payout balance changed; refresh required' using errcode = '40001';
  end if;

  insert into public.performer_payouts(
    performer_id, connected_account_id, amount_yen, status, transfer_status,
    bank_payout_status, idempotency_key, haku_available_yen, stripe_available_yen,
    eligible_yen, funding_model
  ) values (
    p_performer_id, p_connected_account_id, p_amount_yen, 'reserved', 'pending',
    'not_started', p_idempotency_key, v_internal_unallocated, p_stripe_available_yen,
    least(v_internal_unallocated, v_platform_unreserved), 'platform_separate'
  ) returning * into v_row;
  return next v_row;
end $$;

revoke all on function public.reserve_performer_payout(uuid,text,integer,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_performer_payout(uuid,text,integer,text,integer) to service_role;

comment on column public.performer_payouts.transfer_status is 'Connect Transfer state; distinct from a connected account bank payout.';
comment on column public.performer_payouts.bank_payout_status is 'Observed bank payout state, when correlatable; never used as the internal allocation state.';

commit;
