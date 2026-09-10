-- Expand product_events KPI names for behavior-science UX tracking.
-- Additive for analytics semantics. Does not touch user, payment, or performer data.

alter table public.product_events
  drop constraint if exists product_events_name_check;

alter table public.product_events
  add constraint product_events_name_check check (name in (
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
    -- legacy event names kept for historical dashboards
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
  ));
