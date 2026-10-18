-- Additive hardening: privilege triggers, LIVE gate, session-safe writes,
-- hide Stripe account ids from PostgREST clients, set HAKU system-use fees.
-- Does not delete rows. Does not rewrite historical tip/merch fee amounts.

begin;
set local lock_timeout = '5s';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role public.user_role;
begin
  begin
    chosen_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'fan');
  exception when invalid_text_representation then
    chosen_role := 'fan';
  end;

  if chosen_role not in ('fan', 'performer') then
    chosen_role := 'fan';
  end if;

  insert into public.profiles (id, role, status, display_name, email)
  values (
    new.id,
    chosen_role,
    case
      when chosen_role = 'performer' then 'pending'::public.account_status
      else 'active'::public.account_status
    end,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'User'),
    new.email
  );

  if chosen_role = 'performer' then
    insert into public.performers (id, stage_name, is_approved)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Performer'),
      false
    );
  end if;

  return new;
end;
$$;

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

create or replace function public.protect_unapproved_go_live()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_live is true and not public.is_admin() then
    if new.is_approved is not true then
      raise exception 'Unapproved performers cannot go live.'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = new.id and p.status = 'active'
    ) then
      raise exception 'Inactive performer accounts cannot go live.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists performers_protect_unapproved_go_live on public.performers;
create trigger performers_protect_unapproved_go_live
  before insert or update on public.performers
  for each row execute function public.protect_unapproved_go_live();

drop policy if exists tips_admin_update on public.tips;
create policy tips_admin_update on public.tips
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert with check (
    fan_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
  );

drop policy if exists performers_update_own on public.performers;
create policy performers_update_own on public.performers
  for update using (
    public.is_admin()
    or (
      id = auth.uid()
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.status in ('pending', 'active')
      )
    )
  )
  with check (
    public.is_admin()
    or (
      id = auth.uid()
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.status in ('pending', 'active')
      )
    )
  );

revoke select on table public.performers from anon, authenticated;
grant select (
  id, stage_name, bio, genre, country, city, photo_url, support_blurb,
  stripe_onboarding_complete, is_approved, is_live, live_started_at, live_title,
  stream_url, share_location, lat, lng, location_updated_at, video_url, awards,
  appearances, sns_json, created_at, updated_at
) on table public.performers to anon, authenticated;

insert into public.platform_settings (key, value)
values
  ('tip_fee_bps', '1500'::jsonb),
  ('merch_fee_bps', '800'::jsonb)
on conflict (key) do update
set value = excluded.value, updated_at = now();

commit;
