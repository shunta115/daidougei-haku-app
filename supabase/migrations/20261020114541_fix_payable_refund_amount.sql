-- Follow-up for environments where automatic_performer_transfers was already
-- applied: retain the newly calculated amount owed so post-Transfer refunds
-- can reverse exactly the overpaid difference.
begin;

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
  select stripe_account_id into v_account_id from public.performers where id = p_performer_id;
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
      when performer_transfer_payables.state in ('held','ready','retry','blocked') then excluded.connected_account_id
      else performer_transfer_payables.connected_account_id end,
    amount_yen = excluded.amount_yen,
    state = case
      when performer_transfer_payables.state in ('transferred','partially_reversed','reversed')
           and (p_hold_reason is not null or p_amount_yen < performer_transfer_payables.transferred_yen)
        then 'reversal_pending'
      when performer_transfer_payables.state in ('held','ready','retry','blocked') then excluded.state
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

revoke all on function public.sync_performer_transfer_payable(text,uuid,uuid,text,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.sync_performer_transfer_payable(text,uuid,uuid,text,text,integer,text) to service_role;

commit;
