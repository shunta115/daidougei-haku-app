-- Stripe account IDs and onboarding state remain protected from browser roles.
-- Server-side Connect and webhook handlers receive one narrow write operation
-- instead of UPDATE access to every performer column.
create or replace function public.sync_performer_stripe_connect(
  p_performer_id uuid,
  p_stripe_account_id text default null,
  p_onboarding_complete boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_stripe_account_id is not null and p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$' then
    raise exception 'Invalid Stripe account id' using errcode = '22023';
  end if;

  update public.performers
  set stripe_account_id = coalesce(p_stripe_account_id, stripe_account_id),
      stripe_onboarding_complete = coalesce(p_onboarding_complete, stripe_onboarding_complete)
  where id = p_performer_id;

  if not found then
    raise exception 'Performer not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.sync_performer_stripe_connect(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.sync_performer_stripe_connect(uuid, text, boolean)
  to service_role;
