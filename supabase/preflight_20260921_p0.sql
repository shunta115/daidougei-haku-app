-- Read-only preflight for the 20260910 and 20260921 migrations.
-- Run in Production SQL Editor and retain the result before applying anything.

with role_counts as (
  select role::text as role, count(*)::bigint as total
  from public.profiles
  group by role
),
performer_counts as (
  select
    count(*)::bigint as total,
    count(*) filter (where is_approved)::bigint as approved,
    count(*) filter (where is_live)::bigint as live
  from public.performers
),
unknown_product_events as (
  select name, count(*)::bigint as total
  from public.product_events
  where name not in (
    'home_view', 'live_view', 'performer_view', 'follow_click', 'follow_complete',
    'tip_cta_click', 'tip_amount_select', 'tip_checkout_start', 'tip_complete',
    'merch_view', 'merch_checkout_start', 'merch_purchase', 'vote_complete',
    'view_home', 'view_performer', 'click_tip', 'tip_start', 'tip_success',
    'signup_start', 'signup_complete', 'follow', 'vote', 'live_view_start'
  )
  group by name
)
select jsonb_build_object(
  'roles', coalesce((select jsonb_object_agg(role, total) from role_counts), '{}'::jsonb),
  'performers', (select to_jsonb(performer_counts) from performer_counts),
  'unknown_product_events', coalesce((select jsonb_object_agg(name, total) from unknown_product_events), '{}'::jsonb),
  'product_event_constraint', (
    select pg_get_constraintdef(c.oid)
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'product_events'
      and c.conname = 'product_events_name_check'
  ),
  'signup_trigger_function', (
    select p.proname
    from pg_trigger tr
    join pg_proc p on p.oid = tr.tgfoid
    where tr.tgname = 'on_auth_user_created'
      and not tr.tgisinternal
  ),
  'performer_public_policy', (
    select qual
    from pg_policies
    where schemaname = 'public'
      and tablename = 'performers'
      and policyname = 'performers_public_read'
  )
) as preflight;
