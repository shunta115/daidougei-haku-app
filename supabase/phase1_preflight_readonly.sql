-- Read-only. One statement, one Results table.
-- No CREATE / ALTER / DROP / INSERT / UPDATE / DELETE.
-- Catalog / information_schema only. Safe if public tables are missing.

with wanted(table_name) as (
  select unnest(array[
    'profiles',
    'performers',
    'tips',
    'live_sessions',
    'notifications',
    'follows',
    'live_comments',
    'live_tip_events',
    'platform_settings',
    'events',
    'event_venues',
    'event_slots',
    'event_lineup',
    'oshi',
    'event_votes',
    'reports'
  ])
),
expected_cols(table_name, column_name, expected_udt) as (
  values
    ('profiles', 'id', 'uuid'),
    ('performers', 'id', 'uuid'),
    ('performers', 'stage_name', 'text'),
    ('performers', 'live_title', 'text'),
    ('performers', 'video_url', 'text'),
    ('performers', 'awards', 'text'),
    ('performers', 'appearances', 'text'),
    ('performers', 'sns_json', 'jsonb'),
    ('tips', 'id', 'uuid'),
    ('live_sessions', 'id', 'uuid'),
    ('live_sessions', 'title', 'text'),
    ('live_sessions', 'viewer_peak', 'int4'),
    ('notifications', 'user_id', 'uuid'),
    ('notifications', 'title', 'text'),
    ('notifications', 'body', 'text'),
    ('notifications', 'link', 'text'),
    ('follows', 'fan_id', 'uuid'),
    ('follows', 'performer_id', 'uuid'),
    ('live_comments', 'id', 'uuid'),
    ('live_comments', 'performer_id', 'uuid'),
    ('live_comments', 'live_session_id', 'uuid'),
    ('live_comments', 'user_id', 'uuid'),
    ('live_comments', 'display_name', 'text'),
    ('live_comments', 'body', 'text'),
    ('live_comments', 'created_at', 'timestamptz'),
    ('live_tip_events', 'id', 'uuid'),
    ('live_tip_events', 'tip_id', 'uuid'),
    ('live_tip_events', 'performer_id', 'uuid'),
    ('live_tip_events', 'amount_cents', 'int4'),
    ('live_tip_events', 'tier', 'text'),
    ('platform_settings', 'key', 'text'),
    ('platform_settings', 'value', 'jsonb'),
    ('events', 'id', 'uuid'),
    ('events', 'slug', 'text'),
    ('events', 'name_ja', 'text'),
    ('events', 'name_en', 'text'),
    ('events', 'presenter_ja', 'text'),
    ('events', 'presenter_en', 'text'),
    ('events', 'date_label', 'text'),
    ('events', 'place_label', 'text'),
    ('events', 'hours_label', 'text'),
    ('events', 'weather_note_ja', 'text'),
    ('events', 'weather_note_en', 'text'),
    ('events', 'starts_on', 'date'),
    ('events', 'ends_on', 'date'),
    ('events', 'status', 'text'),
    ('events', 'is_featured', 'bool'),
    ('event_venues', 'id', 'text'),
    ('event_venues', 'event_id', 'uuid'),
    ('event_venues', 'name_ja', 'text'),
    ('event_venues', 'name_en', 'text'),
    ('event_venues', 'lat', 'float8'),
    ('event_venues', 'lng', 'float8'),
    ('event_slots', 'id', 'uuid'),
    ('event_slots', 'event_id', 'uuid'),
    ('event_slots', 'venue_id', 'text'),
    ('event_lineup', 'event_id', 'uuid'),
    ('event_lineup', 'performer_id', 'uuid'),
    ('oshi', 'fan_id', 'uuid'),
    ('oshi', 'performer_id', 'uuid'),
    ('event_votes', 'event_id', 'uuid'),
    ('event_votes', 'performer_id', 'uuid'),
    ('event_votes', 'fan_id', 'uuid'),
    ('reports', 'id', 'uuid'),
    ('reports', 'reporter_id', 'uuid')
),
report as (
  select
    1 as ord,
    'table'::text as section,
    w.table_name as item,
    ''::text as expected,
    (to_regclass('public.' || w.table_name) is not null)::text as actual,
    case
      when to_regclass('public.' || w.table_name) is not null then 'exists'
      else 'missing'
    end as check_result
  from wanted w

  union all

  select
    2,
    'column',
    e.table_name || '.' || e.column_name,
    e.expected_udt,
    coalesce(c.udt_name, ''),
    case
      when to_regclass('public.' || e.table_name) is null then 'table_missing'
      when c.column_name is null then 'column_missing'
      when c.udt_name::text <> e.expected_udt then 'type_mismatch'
      else 'ok'
    end
  from expected_cols e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = e.table_name
   and c.column_name = e.column_name

  union all

  select
    4,
    'enum',
    'user_role',
    'type exists',
    exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'user_role'
    )::text,
    case
      when exists (
        select 1
        from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typname = 'user_role'
      ) then 'ok'
      else 'missing'
    end

  union all

  select
    4,
    'enum_value',
    'user_role.' || e.enumlabel,
    '',
    e.enumlabel,
    'present'
  from pg_type t
  join pg_enum e on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typname = 'user_role'

  union all

  select
    5,
    'rls',
    c.relname,
    '',
    'enabled=' || c.relrowsecurity::text || ', forced=' || c.relforcerowsecurity::text,
    case when c.relrowsecurity then 'rls_on' else 'rls_off' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join wanted w on w.table_name = c.relname
  where n.nspname = 'public' and c.relkind = 'r'

  union all

  select
    6,
    'policy',
    p.tablename || '.' || p.policyname,
    p.cmd,
    coalesce(array_to_string(p.roles, ','), ''),
    'present'
  from pg_policies p
  join wanted w on w.table_name = p.tablename
  where p.schemaname = 'public'

  union all

  select
    7,
    'function',
    p.proname,
    '',
    pg_get_function_identity_arguments(p.oid),
    'present'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'handle_new_user',
      'is_admin',
      'notify_followers_live_start',
      'notify_event_appearances'
    )

  union all

  select
    7,
    'function',
    fname,
    'must exist',
    '',
    'missing'
  from unnest(array[
    'handle_new_user',
    'is_admin',
    'notify_followers_live_start',
    'notify_event_appearances'
  ]) as fname
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fname
  )

  union all

  select
    8,
    'constraint',
    cls.relname || '.' || c.conname,
    c.contype::text,
    pg_get_constraintdef(c.oid),
    'present'
  from pg_constraint c
  join pg_class cls on cls.oid = c.conrelid
  join pg_namespace n on n.oid = cls.relnamespace
  join wanted w on w.table_name = cls.relname
  where n.nspname = 'public'

  union all

  select
    9,
    'index',
    i.tablename || '.' || i.indexname,
    '',
    i.indexdef,
    'present'
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename in ('events', 'event_venues', 'platform_settings', 'live_tip_events')
)
select
  ord as section_no,
  section,
  item,
  expected,
  actual,
  check_result
from report
order by 1, 2, 3;
