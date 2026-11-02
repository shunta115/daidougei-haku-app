\set ON_ERROR_STOP on
-- Disposable TEST database only. This fixture intentionally never connects to a linked project.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create table auth.users(id uuid primary key, email text unique, password_hash text);
create table auth.sessions(id uuid primary key, user_id uuid references auth.users);
create table public.profiles(id uuid primary key references auth.users, display_name text, email text, role text, status text);
create table public.performers(id uuid primary key references public.profiles, stage_name text not null, is_approved boolean default false, is_live boolean default false, review_status text default 'pending', stripe_account_id text, stripe_onboarding_complete boolean default false);
create table public.admin_audit(admin_id uuid references public.profiles, action text, target_id uuid, meta jsonb,
  constraint test_audit_failure check (target_id <> '00000000-0000-0000-0000-000000000005'));
create table public.test_history(kind text, user_id uuid references public.profiles, amount integer);
insert into auth.users select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'test' || n || '@example.invalid', 'unchanged-hash' from generate_series(1,5) n;
insert into public.profiles select id, 'TEST', email, case when email = 'test2@example.invalid' then 'admin' else 'fan' end,
  case when email = 'test4@example.invalid' then 'suspended' else 'active' end from auth.users;
insert into auth.sessions values('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
insert into public.test_history select kind, '00000000-0000-0000-0000-000000000001', 1234 from unnest(array['tip','follow','reservation','payment']) kind;
insert into public.performers(id,stage_name,stripe_account_id,stripe_onboarding_complete,is_approved,review_status)
values('00000000-0000-0000-0000-000000000003','Existing','acct_test_preserved',true,true,'approved');
create temp table snapshots as select
  (select jsonb_agg(to_jsonb(u)) from auth.users u) users,
  (select jsonb_agg(to_jsonb(s)) from auth.sessions s) sessions,
  (select jsonb_agg(to_jsonb(h)) from public.test_history h) history,
  (select to_jsonb(p) from public.performers p where id = '00000000-0000-0000-0000-000000000003') performer;
\ir ../../supabase/migrations/20261102023117_fan_performer_application.sql
grant usage on schema public, auth to service_role;
grant select, insert, update on all tables in schema public to service_role;
set role service_role;
set request.jwt.claim.role = 'service_role';
select public.apply_fan_performer('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
select public.apply_fan_performer('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
select public.apply_fan_performer('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if not exists(select 1 from profiles where id='00000000-0000-0000-0000-000000000001' and role='performer' and status='active' and email='test1@example.invalid') then raise exception 'identity changed'; end if;
  if not exists(select 1 from performers where id='00000000-0000-0000-0000-000000000001' and not is_approved and not is_live and review_status='pending') then raise exception 'approval bypass'; end if;
  if (select count(*) from admin_audit where target_id='00000000-0000-0000-0000-000000000001') <> 1 then raise exception 'retry is not idempotent'; end if;
  if (select jsonb_agg(to_jsonb(u)) from auth.users u) <> (select users from snapshots) or
     (select jsonb_agg(to_jsonb(s)) from auth.sessions s) <> (select sessions from snapshots) or
     (select jsonb_agg(to_jsonb(h)) from test_history h) <> (select history from snapshots) or
     (select to_jsonb(p) from performers p where id='00000000-0000-0000-0000-000000000003') <> (select performer from snapshots)
  then raise exception 'preserved data modified'; end if;
  if has_function_privilege('anon','public.apply_fan_performer(uuid,uuid)','execute') or has_function_privilege('authenticated','public.apply_fan_performer(uuid,uuid)','execute') then raise exception 'public RPC exposed'; end if;
  begin
    perform public.apply_fan_performer('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002');
    raise exception 'suspended accepted';
  exception when raise_exception then if sqlerrm='suspended accepted' then raise; end if; end;
  begin
    perform public.apply_fan_performer('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003');
    raise exception 'non-admin accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.apply_fan_performer('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002');
    raise exception 'audit failure accepted';
  exception when check_violation then null; end;
  if exists(select 1 from performers where id='00000000-0000-0000-0000-000000000005') or
     exists(select 1 from profiles where id='00000000-0000-0000-0000-000000000005' and role <> 'fan') then raise exception 'partial write after failure'; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.apply_fan_performer('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
    raise exception 'untrusted role accepted';
  exception when insufficient_privilege then null; end;
end $$;
-- Existing approval endpoint remains responsible for review; verify independent state.
update performers set is_approved=true, review_status='approved' where id='00000000-0000-0000-0000-000000000001';
select 'PASS: identity, sessions, histories, Connect, pending review, idempotency, permissions, rollback' as result;
