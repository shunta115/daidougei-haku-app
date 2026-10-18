-- Additive, non-destructive admin review workflow.
begin;
set local lock_timeout = '5s';

alter table public.performers
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'performers_review_status_check'
      and conrelid = 'public.performers'::regclass
  ) then
    alter table public.performers add constraint performers_review_status_check
      check (review_status in ('pending', 'approved', 'rejected')) not valid;
    alter table public.performers validate constraint performers_review_status_check;
  end if;
end $$;

update public.performers
set review_status = 'approved', reviewed_at = coalesce(reviewed_at, updated_at, created_at)
where is_approved is true and review_status <> 'approved';

create index if not exists performers_review_status_created_idx
  on public.performers (review_status, created_at desc);

create or replace function public.protect_performer_privileged_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
    and auth.uid() = old.id
    and not public.is_admin()
    and (
      new.is_approved is distinct from old.is_approved
      or new.stripe_account_id is distinct from old.stripe_account_id
      or new.stripe_onboarding_complete is distinct from old.stripe_onboarding_complete
      or new.review_status is distinct from old.review_status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
      or new.rejection_reason is distinct from old.rejection_reason
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception 'Approval, review, and payout status can only be changed by the office.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on public.admin_audit from anon, authenticated;
grant select, insert on public.admin_audit to authenticated;
drop policy if exists admin_audit_admin_only on public.admin_audit;
create policy admin_audit_admin_only on public.admin_audit
  for all using (public.is_admin()) with check (public.is_admin());

commit;
