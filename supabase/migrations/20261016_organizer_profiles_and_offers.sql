-- Additive organizer profiles and structured performer offers.
-- Existing booking_inquiries are intentionally preserved and unchanged.

create table if not exists public.organizer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_name text not null,
  description text not null default '',
  website_url text,
  country text not null default '',
  region text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizer_profiles enable row level security;
drop policy if exists organizer_profiles_public_read on public.organizer_profiles;
create policy organizer_profiles_public_read on public.organizer_profiles for select using (true);
drop policy if exists organizer_profiles_own_insert on public.organizer_profiles;
create policy organizer_profiles_own_insert on public.organizer_profiles
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'organizer')
  );
drop policy if exists organizer_profiles_own_update on public.organizer_profiles;
create policy organizer_profiles_own_update on public.organizer_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.organizer_profiles to anon, authenticated;
grant insert, update on public.organizer_profiles to authenticated;

create table if not exists public.performance_offers (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  performer_id uuid not null references public.performers(id) on delete restrict,
  requester_name text not null,
  event_name text not null,
  desired_date date not null,
  location text not null,
  performance_details text not null default '',
  requested_duration text not null default '',
  compensation_terms text not null default '',
  notes text not null default '',
  response_deadline timestamptz,
  status text not null default 'draft' check (status in ('draft','sent','reviewing','accepted','declined','cancelled','expired')),
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists performance_offers_organizer_idx on public.performance_offers(organizer_id, created_at desc);
create index if not exists performance_offers_performer_idx on public.performance_offers(performer_id, created_at desc);

alter table public.performance_offers enable row level security;
drop policy if exists performance_offers_parties_read on public.performance_offers;
create policy performance_offers_parties_read on public.performance_offers
  for select to authenticated using (organizer_id = (select auth.uid()) or performer_id = (select auth.uid()) or public.is_admin());
drop policy if exists performance_offers_organizer_insert on public.performance_offers;
create policy performance_offers_organizer_insert on public.performance_offers
  for insert to authenticated with check (
    organizer_id = (select auth.uid())
    and status = 'draft'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'organizer')
  );
drop policy if exists performance_offers_parties_update on public.performance_offers;
create policy performance_offers_parties_update on public.performance_offers
  for update to authenticated using (organizer_id = (select auth.uid()) or performer_id = (select auth.uid()) or public.is_admin())
  with check (organizer_id = (select auth.uid()) or performer_id = (select auth.uid()) or public.is_admin());
drop policy if exists performance_offers_draft_delete on public.performance_offers;
create policy performance_offers_draft_delete on public.performance_offers
  for delete to authenticated using ((organizer_id = (select auth.uid()) and status = 'draft') or public.is_admin());

grant select, insert, update, delete on public.performance_offers to authenticated;

create or replace function public.validate_performance_offer_write()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_old_payload jsonb;
  v_new_payload jsonb;
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.sent_at := null;
    new.responded_at := null;
    new.updated_at := clock_timestamp();
    return new;
  end if;
  if new.organizer_id is distinct from old.organizer_id or new.performer_id is distinct from old.performer_id then
    raise exception 'offer parties cannot change';
  end if;
  if public.is_admin() then new.updated_at := clock_timestamp(); return new; end if;
  if v_uid = old.performer_id then
    v_old_payload := to_jsonb(old) - array['status','responded_at','updated_at'];
    v_new_payload := to_jsonb(new) - array['status','responded_at','updated_at'];
    if v_new_payload is distinct from v_old_payload then raise exception 'performer may only respond'; end if;
    if old.status not in ('sent','reviewing') or new.status not in ('reviewing','accepted','declined') then raise exception 'invalid performer transition'; end if;
    if new.status in ('accepted','declined') then new.responded_at := clock_timestamp(); end if;
  elsif v_uid = old.organizer_id then
    if old.status = 'draft' and new.status in ('draft','sent') then
      if new.status = 'sent' then new.sent_at := clock_timestamp(); end if;
    elsif old.status in ('sent','reviewing') and new.status = 'cancelled' then
      null;
    else
      raise exception 'invalid organizer transition';
    end if;
  else
    raise exception 'not allowed';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.validate_performance_offer_write() from public, anon, authenticated;
drop trigger if exists performance_offers_validate_write on public.performance_offers;
create trigger performance_offers_validate_write
  before insert or update on public.performance_offers
  for each row execute function public.validate_performance_offer_write();

