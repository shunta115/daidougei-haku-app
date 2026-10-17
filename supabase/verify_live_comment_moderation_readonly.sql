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

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
order by tablename, policyname;

-- Expected browser ACL:
-- anon: live_comments SELECT only
-- authenticated: comments SELECT/INSERT/DELETE; moderators SELECT/INSERT/DELETE;
--                mutes SELECT/INSERT/UPDATE/DELETE
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in ('live_comments', 'live_comment_moderators', 'live_comment_mutes')
order by table_name, grantee, privilege_type;

-- Must return no rows. Additional permissive INSERT/DELETE/ALL policies would
-- be OR-combined by Postgres and could bypass P3 moderation restrictions.
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'live_comments'
  and cmd in ('INSERT', 'DELETE', 'ALL')
  and policyname not in ('live_comments_insert', 'live_comments_moderator_delete');

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'live_comments';

select tc.table_name, tc.constraint_name, tc.constraint_type,
       kcu.column_name, ccu.table_name as foreign_table_name,
       ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name = tc.constraint_name
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_schema = tc.constraint_schema
 and ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name in ('live_comment_moderators', 'live_comment_mutes')
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('live_comment_moderators', 'live_comment_mutes')
order by tablename, indexname;

select
  count(*) filter (where live_session_id is null) as legacy_comment_count,
  count(*) filter (where live_session_id is not null) as session_comment_count,
  count(*) as total_comment_count
from public.live_comments;
