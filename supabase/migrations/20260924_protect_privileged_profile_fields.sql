-- Prevent authenticated clients from promoting their own account or approving
-- their own performer profile. Additive protection only; no existing rows are
-- rewritten. Service-role operations and active admins remain allowed.

begin;
set local lock_timeout = '5s';

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and auth.uid() = old.id
    and not public.is_admin()
    and (
      new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.email is distinct from old.email
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception 'Account role and status can only be changed by the office.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_fields on public.profiles;
create trigger profiles_protect_privileged_fields
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

create or replace function public.protect_performer_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and auth.uid() = old.id
    and not public.is_admin()
    and (
      new.is_approved is distinct from old.is_approved
      or new.stripe_account_id is distinct from old.stripe_account_id
      or new.stripe_onboarding_complete is distinct from old.stripe_onboarding_complete
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception 'Approval and payout status can only be changed by the office.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists performers_protect_privileged_fields on public.performers;
create trigger performers_protect_privileged_fields
  before update on public.performers
  for each row execute function public.protect_performer_privileged_fields();

drop policy if exists performers_admin_insert on public.performers;
create policy performers_admin_insert on public.performers
  for insert with check (
    public.is_admin()
    or (
      id = auth.uid()
      and is_approved = false
      and is_live = false
      and stripe_account_id is null
      and stripe_onboarding_complete = false
    )
  );

commit;
