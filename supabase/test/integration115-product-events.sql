-- TEST only: product_events prerequisite used by real home activity ranking.
-- No other ops tables or existing rows are changed.
begin;
do $$ begin if to_regclass('public.product_events') is not null then raise exception 'Existing product_events: review instead of overwriting'; end if; end $$;
-- Same additive ops foundation as supabase/ops_foundation.sql (repo history).
create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in (
    'home_view',
    'live_view',
    'performer_view',
    'follow_click',
    'follow_complete',
    'tip_cta_click',
    'tip_amount_select',
    'tip_checkout_start',
    'tip_complete',
    'merch_view',
    'merch_checkout_start',
    'merch_purchase',
    'vote_complete',
    'view_home',
    'view_performer',
    'click_tip',
    'tip_start',
    'tip_success',
    'signup_start',
    'signup_complete',
    'follow',
    'vote',
    'live_view_start'
  )),
  session_id text not null,
  user_id uuid references public.profiles (id) on delete set null,
  performer_id uuid,
  event_id uuid,
  path text,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_created_idx on public.product_events (created_at desc);
create index if not exists product_events_name_created_idx on public.product_events (name, created_at desc);
create index if not exists product_events_session_idx on public.product_events (session_id);

alter table public.product_events enable row level security;
revoke all on public.product_events from public,anon,authenticated;
grant insert on public.product_events to anon,authenticated;
grant select on public.product_events to authenticated;
grant select,insert on public.product_events to service_role;
create policy product_events_insert on public.product_events for insert to anon,authenticated
 with check(user_id is null or user_id=(select auth.uid()));
create policy product_events_admin_read on public.product_events for select to authenticated using(public.is_admin());
commit;
