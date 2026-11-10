create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema storage;
create table auth.users (
  id uuid primary key, email text not null, email_confirmed_at timestamptz,
  banned_until timestamptz, deleted_at timestamptz, is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'
);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (bucket_id text, name text);
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/'); $$;

\ir ../../supabase/migrations/20260726_platform_beta.sql
\ir ../../supabase/migrations/20260924_protect_privileged_profile_fields.sql
\ir ../../supabase/migrations/20261003_admin_review_workflow.sql

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:'target_uuid', :'verified_email', now(), jsonb_build_object('display_name', :'expected_display_name')),
  (:'actor_uuid', 'operator@example.invalid', now(), '{}'),
  (:'other_uuid', 'other@example.invalid', now(), '{"role":"performer","display_name":"Other performer"}');
update public.profiles set role = 'admin' where id = :'actor_uuid';
\ir ../../supabase/migrations/20261005_admin_members.sql

-- Shape of the production history and visibility checks, using synthetic data only.
alter table public.performers add column is_private_test boolean not null default false;
drop policy performers_public_read on public.performers;
create policy performers_public_read on public.performers for select
  using ((is_approved and not is_private_test) or id = auth.uid() or public.is_admin());
grant usage on schema auth to anon, authenticated;
grant select on public.performers to anon, authenticated;
grant select on public.profiles to authenticated;
grant update on public.performers to authenticated;

alter table public.tips add column original_performer_id uuid;
create table public.live_tip_events (original_performer_id uuid);
create table public.merch_orders (buyer_id uuid references public.profiles, original_seller_id uuid);
create table public.merch_products (original_seller_id uuid);
create table public.performer_payouts (performer_id uuid references public.performers, original_performer_id uuid, amount_yen int);
create table public.payment_beneficiary_dispositions (original_performer_id uuid);
create table public.event_device_ballots (performer_id uuid references public.performers, original_performer_id uuid);
create table public.event_device_ballots_backup_20261011_daily (performer_id uuid);
create table public.product_events (user_id uuid references public.profiles, performer_id uuid, event_name text);
create table public.account_retirements (original_auth_user_id uuid, email_sha256 text);
create table public.live_reservations (user_id uuid references public.profiles, performer_id uuid references public.performers);

insert into auth.identities (user_id) values (:'target_uuid');
insert into auth.sessions (user_id) values (:'target_uuid');
update public.profiles set avatar_url = 'https://example.invalid/avatar' where id = :'target_uuid';
update public.performers set is_approved = true, review_status = 'approved', stripe_account_id = 'fixture-connect'
  where id = :'other_uuid';
insert into public.tips (fan_id, performer_id, amount_cents) values (:'target_uuid', :'other_uuid', 500);
insert into public.follows (fan_id, performer_id) values (:'target_uuid', :'other_uuid');
insert into public.live_reservations values (:'target_uuid', :'other_uuid');
insert into public.merch_orders (buyer_id) values (:'target_uuid');
insert into public.product_events values (:'target_uuid', null, 'fixture_session');
insert into public.event_device_ballots (performer_id) values (:'other_uuid');
insert into public.performer_payouts (performer_id, amount_yen) values (:'other_uuid', 300);
insert into public.admin_audit (admin_id, action, target_id, meta)
  values (:'actor_uuid', 'user.recover_logical_delete', :'target_uuid',
    jsonb_build_object('approval_reference', :'profile_recovery_reference', 'previous_status', 'deleted'));
