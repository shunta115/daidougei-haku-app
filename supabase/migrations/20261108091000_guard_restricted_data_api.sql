begin;

-- Runs before PostgREST queries and RPCs, including SECURITY DEFINER RPCs.
create or replace function public.haku_check_data_api_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' and not exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.status in ('active', 'pending')
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise insufficient_privilege using message = 'Account unavailable';
  end if;
end;
$$;
revoke all on function public.haku_check_data_api_account() from public, anon, authenticated, service_role;
grant execute on function public.haku_check_data_api_account() to anon, authenticated, service_role;

-- Fail the migration instead of silently replacing another hook.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_db_role_setting s
    cross join lateral unnest(s.setconfig) as setting(value)
    where (s.setrole = 0 or s.setrole = 'authenticator'::regrole)
      and (s.setdatabase = 0 or s.setdatabase = (select oid from pg_catalog.pg_database where datname = current_database()))
      and setting.value like 'pgrst.db_pre_request=%'
      and setting.value <> 'pgrst.db_pre_request=public.haku_check_data_api_account'
  ) then
    raise exception 'An existing PostgREST pre-request hook must be reconciled';
  end if;
end;
$$;

alter role authenticator set pgrst.db_pre_request = 'public.haku_check_data_api_account';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;
