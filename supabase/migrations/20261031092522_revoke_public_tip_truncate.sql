-- Remove only destructive table-level access; preserve RLS, row data and service-role DML.
-- TEST verified first. Production application requires separate explicit approval.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
revoke truncate on table public.tips from public, anon, authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.tips', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.tips', 'TRUNCATE') then
    raise exception 'tips TRUNCATE remains inherited; stop and audit role membership';
  end if;
  if not (has_table_privilege('service_role', 'public.tips', 'SELECT')
          and has_table_privilege('service_role', 'public.tips', 'INSERT')
          and has_table_privilege('service_role', 'public.tips', 'UPDATE')) then
    raise exception 'service_role financial DML privileges missing';
  end if;
end
$$;
