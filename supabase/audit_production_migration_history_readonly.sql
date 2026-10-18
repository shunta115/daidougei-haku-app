-- READ ONLY inventory for production/local migration reconciliation.
-- This file must never mutate supabase_migrations.schema_migrations.

select version, name
from supabase_migrations.schema_migrations
order by version;

select
  current_database() as database_name,
  current_setting('server_version') as server_version,
  pg_is_in_recovery() as is_replica,
  current_setting('transaction_read_only') as transaction_read_only;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  c.relreplident as replica_identity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
order by tablename;

select count(*) as live_comment_count
from public.live_comments;
