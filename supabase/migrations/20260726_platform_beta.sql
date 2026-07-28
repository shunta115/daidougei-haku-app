-- Platform β schema: Auth + profiles + live + tips + admin
-- Run in Supabase SQL Editor (or supabase db push)

create extension if not exists "pgcrypto";

-- Roles
create type public.user_role as enum ('fan', 'performer', 'admin');
create type public.account_status as enum ('pending', 'active', 'suspended', 'deleted');
create type public.tip_status as enum ('pending', 'succeeded', 'failed', 'refunded');

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'fan',
  status public.account_status not null default 'active',
  display_name text not null default '',
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Performer public profile (only for role=performer)
create table public.performers (
  id uuid primary key references public.profiles (id) on delete cascade,
  stage_name text not null,
  bio text not null default '',
  genre text not null default '',
  country text not null default '',
  city text not null default '',
  photo_url text,
  support_blurb text not null default '',
  stripe_account_id text,
  stripe_onboarding_complete boolean not null default false,
  is_approved boolean not null default false,
  is_live boolean not null default false,
  live_started_at timestamptz,
  stream_url text,
  share_location boolean not null default false,
  lat double precision,
  lng double precision,
  location_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  stream_url text,
  tip_count integer not null default 0,
  tip_amount_total integer not null default 0
);

create table public.follows (
  fan_id uuid not null references public.profiles (id) on delete cascade,
  performer_id uuid not null references public.performers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fan_id, performer_id)
);

create table public.tips (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid references public.profiles (id) on delete set null,
  performer_id uuid not null references public.performers (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'jpy',
  platform_fee_cents integer not null default 0,
  status public.tip_status not null default 'pending',
  stripe_session_id text unique,
  stripe_payment_intent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();
create trigger performers_updated before update on public.performers
for each row execute function public.set_updated_at();
create trigger tips_updated before update on public.tips
for each row execute function public.set_updated_at();

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role public.user_role;
begin
  chosen_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'fan');
  if chosen_role not in ('fan', 'performer') then
    chosen_role := 'fan';
  end if;

  insert into public.profiles (id, role, status, display_name, email)
  values (
    new.id,
    chosen_role,
    case when chosen_role = 'performer' then 'pending'::public.account_status else 'active'::public.account_status end,
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.performers enable row level security;
alter table public.live_sessions enable row level security;
alter table public.follows enable row level security;
alter table public.tips enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit enable row level security;

-- profiles
create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- performers: anyone can read approved; owner/admin always
-- (Do not join profiles here — profiles RLS would hide rows from fans.)
create policy performers_public_read on public.performers
  for select using (
    is_approved = true
    or id = auth.uid()
    or public.is_admin()
  );
create policy performers_update_own on public.performers
  for update using (id = auth.uid() or public.is_admin());
create policy performers_admin_insert on public.performers
  for insert with check (id = auth.uid() or public.is_admin());

-- live_sessions
create policy live_sessions_read on public.live_sessions
  for select using (
    exists (select 1 from public.performers p where p.id = live_sessions.performer_id and (p.is_approved or p.id = auth.uid()))
    or public.is_admin()
  );
create policy live_sessions_owner_write on public.live_sessions
  for all using (performer_id = auth.uid() or public.is_admin())
  with check (performer_id = auth.uid() or public.is_admin());

-- follows
create policy follows_read on public.follows
  for select using (fan_id = auth.uid() or performer_id = auth.uid() or public.is_admin());
create policy follows_insert on public.follows
  for insert with check (fan_id = auth.uid());
create policy follows_delete on public.follows
  for delete using (fan_id = auth.uid() or public.is_admin());

-- tips
create policy tips_read on public.tips
  for select using (fan_id = auth.uid() or performer_id = auth.uid() or public.is_admin());
create policy tips_insert_fan on public.tips
  for insert with check (fan_id = auth.uid());
create policy tips_admin_update on public.tips
  for update using (public.is_admin() or performer_id = auth.uid());

-- notifications
create policy notifications_own on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid());
create policy notifications_insert_system on public.notifications
  for insert with check (public.is_admin() or auth.uid() is not null);

-- admin_audit
create policy admin_audit_admin_only on public.admin_audit
  for all using (public.is_admin()) with check (public.is_admin());

-- Storage bucket for avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');
create policy avatars_owner_upload on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy avatars_owner_update on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy avatars_owner_delete on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Metrics helpers for admin dashboard (security definer so RLS does not block aggregates)
create or replace function public.get_admin_metrics()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select json_build_object(
    'signups_today', (select count(*) from public.profiles where created_at::date = current_date),
    'performers_total', (select count(*) from public.performers where is_approved = true),
    'fans_total', (select count(*) from public.profiles where role = 'fan' and status = 'active'),
    'lives_total', (select count(*) from public.live_sessions),
    'live_now', (select count(*) from public.performers where is_live = true),
    'tips_today_count', (select count(*) from public.tips where status = 'succeeded' and created_at::date = current_date),
    'tips_today_amount', (select coalesce(sum(amount_cents),0) from public.tips where status = 'succeeded' and created_at::date = current_date),
    'fees_today', (select coalesce(sum(platform_fee_cents),0) from public.tips where status = 'succeeded' and created_at::date = current_date),
    'dau_proxy', (select count(*) from public.profiles where updated_at::date = current_date),
    'mau_proxy', (select count(*) from public.profiles where updated_at >= now() - interval '30 days')
  ) into result;

  return result;
end;
$$;

grant execute on function public.get_admin_metrics() to authenticated;
