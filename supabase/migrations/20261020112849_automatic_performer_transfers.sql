-- Automatic, sale-scoped Connect Transfers for platform-held payments.
-- Historical sales are intentionally NOT backfilled. This prevents the AWP
-- ledger (including the separately-approved 5,550 JPY and unapproved 2,694
-- JPY) from being transferred without a dedicated reconciliation/approval.
begin;
set local lock_timeout = '5s';

alter table public.performer_payouts
  drop constraint if exists performer_payouts_amount_yen_check;
alter table public.performer_payouts
  add constraint performer_payouts_amount_yen_check check (amount_yen > 0);
alter table public.performer_payouts
  add column if not exists transfer_status text,
  add column if not exists bank_payout_status text,
  add column if not exists transfer_completed_at timestamptz,
  add column if not exists last_reconciled_at timestamptz;

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
        - floor(greatest(0, p_gross_yen - p_refunded_yen - greatest(0, p_stripe_fee_yen))
          * greatest(0, p_haku_fee_bps)::numeric / 10000)::integer)
    else floor(p_performer_share_yen::numeric
      * (p_gross_yen - greatest(0, p_refunded_yen)) / p_gross_yen)::integer
  end
$$;

alter table public.tips
  add column if not exists automatic_transfer_eligible_at timestamptz;
alter table public.merch_orders
  add column if not exists automatic_transfer_eligible_at timestamptz;

comment on column public.tips.automatic_transfer_eligible_at is
  'Set only by new checkout creation code; null historical rows are never auto-transferred.';
comment on column public.merch_orders.automatic_transfer_eligible_at is
  'Set only by new checkout creation code; null historical rows are never auto-transferred.';

create table if not exists public.performer_transfer_payables (
  id uuid primary key default gen_random_uuid(),
  sale_kind text not null check (sale_kind in ('tip', 'merch')),
  sale_id uuid not null,
  performer_id uuid not null references public.performers(id) on delete restrict,
  connected_account_id text,
  stripe_charge_id text not null,
  stripe_balance_transaction_id text,
  amount_yen integer not null check (amount_yen >= 0),
  state text not null default 'held' check (state in (
    'held','ready','processing','transferred','retry','blocked','reversal_pending','partially_reversed','reversed'
  )),
  hold_reason text,
  stripe_transfer_id text,
  stripe_transfer_reversal_id text,
  transferred_yen integer not null default 0 check (transferred_yen >= 0),
  reversed_yen integer not null default 0 check (reversed_yen >= 0),
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  last_error_code text,
  last_error_message text,
  alert_after timestamptz,
  claimed_at timestamptz,
  transferred_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sale_kind, sale_id),
  unique (idempotency_key),
  unique (stripe_transfer_id)
);

create index if not exists performer_transfer_payables_retry_idx
  on public.performer_transfer_payables (state, next_retry_at, created_at);
create index if not exists performer_transfer_payables_performer_idx
  on public.performer_transfer_payables (performer_id, created_at desc);

alter table public.performer_transfer_payables enable row level security;
drop policy if exists performer_transfer_payables_self_read on public.performer_transfer_payables;
create policy performer_transfer_payables_self_read on public.performer_transfer_payables
  for select using (auth.uid() = performer_id or public.is_admin());
grant select on public.performer_transfer_payables to authenticated;
revoke insert, update, delete on public.performer_transfer_payables from anon, authenticated;

-- Insert/update only the explicitly supplied, newly-settled sale. There is no
-- historical scan or backfill in this function.
create or replace function public.sync_performer_transfer_payable(
  p_sale_kind text,
  p_sale_id uuid,
  p_performer_id uuid,
  p_stripe_charge_id text,
  p_stripe_balance_transaction_id text,
  p_amount_yen integer,
  p_hold_reason text
) returns public.performer_transfer_payables
language plpgsql security definer set search_path = public as $$
declare
  v_row public.performer_transfer_payables;
  v_account_id text;
begin
  if p_sale_kind not in ('tip','merch') or p_amount_yen < 0
     or coalesce(p_stripe_charge_id, '') !~ '^ch_' then
    raise exception 'invalid payable' using errcode = '22023';
  end if;

  select stripe_account_id into v_account_id
  from public.performers where id = p_performer_id;
  if not found then raise exception 'performer not found' using errcode = '23503'; end if;

  insert into public.performer_transfer_payables(
    sale_kind, sale_id, performer_id, connected_account_id,
    stripe_charge_id, stripe_balance_transaction_id, amount_yen, state,
    hold_reason, idempotency_key, next_retry_at, alert_after
  ) values (
    p_sale_kind, p_sale_id, p_performer_id, v_account_id,
    p_stripe_charge_id, p_stripe_balance_transaction_id, p_amount_yen,
    case when p_amount_yen = 0 or p_hold_reason is not null or v_account_id is null then 'held' else 'ready' end,
    case when p_amount_yen = 0 then coalesce(p_hold_reason, 'no_payable_amount')
         when v_account_id is null then 'connect_not_registered' else p_hold_reason end,
    'haku-sale-transfer:' || p_sale_kind || ':' || p_sale_id::text,
    case when p_amount_yen > 0 and p_hold_reason is null and v_account_id is not null then now() else null end,
    now() + interval '24 hours'
  )
  on conflict (sale_kind, sale_id) do update set
    stripe_balance_transaction_id = excluded.stripe_balance_transaction_id,
    connected_account_id = case
      when performer_transfer_payables.state in ('held','ready','retry','blocked')
        then excluded.connected_account_id
      else performer_transfer_payables.connected_account_id end,
    -- Keep the latest amount owed even after a Transfer. transferred_yen is
    -- immutable evidence of what actually moved and drives any reversal due.
    amount_yen = excluded.amount_yen,
    state = case
      when performer_transfer_payables.state in ('transferred','partially_reversed','reversed')
           and (p_hold_reason is not null or p_amount_yen < performer_transfer_payables.transferred_yen)
        then 'reversal_pending'
      when performer_transfer_payables.state in ('held','ready','retry','blocked')
        then excluded.state
      else performer_transfer_payables.state end,
    hold_reason = case
      when performer_transfer_payables.state in ('transferred','partially_reversed','reversed')
        then coalesce(p_hold_reason, performer_transfer_payables.hold_reason)
      else excluded.hold_reason end,
    next_retry_at = case
      when performer_transfer_payables.state in ('held','ready','retry','blocked') then excluded.next_retry_at
      else performer_transfer_payables.next_retry_at end,
    updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.claim_performer_transfer_payables(
  p_performer_id uuid,
  p_connected_account_id text,
  p_limit integer default 20
) returns setof public.performer_transfer_payables
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_connected_account_id, '') !~ '^acct_' then
    raise exception 'invalid connected account' using errcode = '22023';
  end if;
  if not exists (select 1 from public.performers
    where id = p_performer_id and stripe_account_id = p_connected_account_id) then
    raise exception 'connected account does not belong to performer' using errcode = '23514';
  end if;

  -- A sale created before onboarding remains held. The verified account.updated
  -- path can atomically attach and release only this performer's rows.
  update public.performer_transfer_payables set
    connected_account_id = p_connected_account_id,
    state = 'ready', hold_reason = null, next_retry_at = now(), updated_at = now()
  where performer_id = p_performer_id and state = 'held'
    and hold_reason = 'connect_not_registered' and amount_yen > 0;

  return query
  with candidates as (
    select p.id from public.performer_transfer_payables p
    where p.performer_id = p_performer_id
      and p.connected_account_id = p_connected_account_id
      and p.amount_yen > 0
      and (
        (p.state in ('ready','retry') and (p.next_retry_at is null or p.next_retry_at <= now()))
        or (p.state = 'processing' and p.claimed_at <= now() - interval '15 minutes')
      )
    order by p.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.performer_transfer_payables p set
    state = 'processing', claimed_at = now(), attempt_count = p.attempt_count + 1,
    next_retry_at = now() + interval '15 minutes', updated_at = now()
  from candidates c where p.id = c.id
  returning p.*;
end $$;

revoke all on function public.sync_performer_transfer_payable(text,uuid,uuid,text,text,integer,text)
  from public, anon, authenticated;
revoke all on function public.claim_performer_transfer_payables(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.sync_performer_transfer_payable(text,uuid,uuid,text,text,integer,text) to service_role;
grant execute on function public.claim_performer_transfer_payables(uuid,text,integer) to service_role;

comment on table public.performer_transfer_payables is
  'Automatic sale-scoped Connect Transfer ledger. No historical rows are backfilled.';

-- Replace the legacy manual aggregate RPC so no server path retains HAKU's
-- former 10,000 JPY threshold. Automatic sale-scoped processing is preferred,
-- while this compatibility RPC remains atomic for an explicit reconciliation.
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
  if p_amount_yen <= 0 then raise exception 'zero payout is not allowed' using errcode = '22023'; end if;
  if coalesce(p_connected_account_id, '') !~ '^acct_' then raise exception 'invalid connected account' using errcode = '22023'; end if;
  if not exists (select 1 from public.performers where id = p_performer_id and stripe_account_id = p_connected_account_id) then
    raise exception 'connected account does not belong to performer' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('haku-platform-transfer-reservation', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_performer_id::text, 0));
  if exists (select 1 from public.performer_payouts where performer_id = p_performer_id and status = 'reserved') then
    raise unique_violation using message = 'open payout already exists';
  end if;
  select greatest(0,
    coalesce((select sum(public.payout_remaining_share_yen(status, dispute_status, performer_share_yen,
      coalesce(gross_amount_yen, amount_cents), stripe_fee_yen, haku_fee_bps, refunded_amount_yen))
      from public.tips where performer_id = p_performer_id and stripe_session_id like 'cs_live_%'
      and stripe_checkout_mode = 'platform_separate' and settlement_status = 'settled'), 0)
    + coalesce((select sum(public.payout_remaining_share_yen(status, dispute_status, performer_share_yen,
      coalesce(gross_amount_yen, amount_yen), stripe_fee_yen, haku_fee_bps, refunded_amount_yen))
      from public.merch_orders where seller_id = p_performer_id and stripe_session_id like 'cs_live_%'
      and stripe_checkout_mode = 'platform_separate' and settlement_status = 'settled'), 0)
    - coalesce((select sum(amount_yen) from public.performer_payouts
      where performer_id = p_performer_id and status in ('reserved','paid')), 0)
  ) into v_internal_unallocated;
  select greatest(0, coalesce(p_stripe_available_yen, 0) - coalesce(sum(amount_yen), 0))
    into v_platform_unreserved from public.performer_payouts where status = 'reserved';
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

commit;
