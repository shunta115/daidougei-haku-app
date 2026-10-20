-- Recover held onboarding balances and prevent an active processing lease from
-- being claimed concurrently. Stripe idempotency remains the final safeguard.
begin;

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

revoke all on function public.claim_performer_transfer_payables(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.claim_performer_transfer_payables(uuid,text,integer) to service_role;

commit;
