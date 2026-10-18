-- Explicit, server-enforced privacy for the production Test Performer.
-- Additive except for setting the single verified test performer row true.
begin;
set local lock_timeout = '5s';

alter table public.performers
  add column if not exists is_private_test boolean not null default false;

comment on column public.performers.is_private_test is
  'When true, public discovery, event placement, LIVE sessions, and viewer tokens are restricted to the owner/admin.';

update public.performers
set is_private_test = true
where id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
  and stage_name = 'Test Performer'
  and is_private_test is false;

do $$
begin
  if not exists (
    select 1 from public.performers
    where id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
      and stage_name = 'Test Performer'
      and is_private_test is true
  ) then
    raise exception 'Verified Test Performer row was not found; rolling back.';
  end if;
  if exists (
    select 1 from public.event_lineup
    where performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
  ) or exists (
    select 1 from public.event_slots
    where performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
  ) or exists (
    select 1 from public.event_guest_appearances
    where linked_performer_id = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'::uuid
  ) then
    raise exception 'Test Performer is linked to a public event; rolling back for manual review.';
  end if;
end $$;

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
      or new.is_private_test is distinct from old.is_private_test
      or new.stripe_account_id is distinct from old.stripe_account_id
      or new.stripe_onboarding_complete is distinct from old.stripe_onboarding_complete
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception 'Approval, privacy, and payout status can only be changed by the office.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_performer_privileged_fields() from public, anon, authenticated;

alter policy performers_admin_insert on public.performers
  with check (
    public.is_admin()
    or (
      id = auth.uid()
      and is_approved = false
      and is_private_test = false
      and is_live = false
      and stripe_account_id is null
      and stripe_onboarding_complete = false
    )
  );

alter policy performers_public_read on public.performers
  using (
    (is_approved = true and is_private_test = false)
    or id = auth.uid()
    or public.is_admin()
  );

alter policy live_sessions_read on public.live_sessions
  using (
    exists (
      select 1 from public.performers p
      where p.id = live_sessions.performer_id
        and (
          (p.is_approved = true and p.is_private_test = false)
          or p.id = auth.uid()
          or public.is_admin()
        )
    )
  );

create or replace function public.block_private_test_event_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_performer_id uuid;
begin
  target_performer_id := case
    when tg_table_name = 'event_guest_appearances'
      then nullif(to_jsonb(new)->>'linked_performer_id', '')::uuid
    else nullif(to_jsonb(new)->>'performer_id', '')::uuid
  end;
  if target_performer_id is not null and exists (
    select 1 from public.performers p
    where p.id = target_performer_id and p.is_private_test is true
  ) then
    raise exception 'Private test performers cannot be linked to public events.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.block_private_test_event_link() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'event_lineup_block_private_test') then
    create trigger event_lineup_block_private_test
      before insert or update on public.event_lineup
      for each row execute function public.block_private_test_event_link();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'event_slots_block_private_test') then
    create trigger event_slots_block_private_test
      before insert or update on public.event_slots
      for each row execute function public.block_private_test_event_link();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'event_guest_appearances_block_private_test') then
    create trigger event_guest_appearances_block_private_test
      before insert or update on public.event_guest_appearances
      for each row execute function public.block_private_test_event_link();
  end if;
end $$;

commit;
