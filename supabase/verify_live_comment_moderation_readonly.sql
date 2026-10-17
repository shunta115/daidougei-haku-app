-- Read-only verification after 20261016142951_live_comment_moderation.sql.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  c.relreplident as replica_identity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
order by c.relname;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
order by tablename, policyname;

select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
order by table_name, privilege_type;

select
  count(*) filter (where live_session_id is null) as legacy_comment_count,
  count(*) filter (where live_session_id is not null) as session_comment_count,
  count(*) as total_comment_count
from public.live_comments;
