-- Stripe Connect Direct Charges readiness.
-- Additive only: no DROP / DELETE / TRUNCATE and no existing data overwrite except
-- backfilling new nullable mirror columns from existing payment columns.

alter table public.tips
  add column if not exists gross_amount_yen integer,
  add column if not exists platform_fee_yen integer,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists connected_account_id text,
  add column if not exists stripe_checkout_mode text,
  add column if not exists stripe_application_fee_id text,
  add column if not exists refunded_amount_yen integer not null default 0,
  add column if not exists dispute_status text,
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_closed_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists paid_at timestamptz;

update public.tips
set
  gross_amount_yen = coalesce(gross_amount_yen, amount_cents),
  platform_fee_yen = coalesce(platform_fee_yen, platform_fee_cents),
  stripe_payment_intent_id = coalesce(stripe_payment_intent_id, stripe_payment_intent)
where gross_amount_yen is null
  or platform_fee_yen is null
  or (stripe_payment_intent_id is null and stripe_payment_intent is not null);

insert into public.platform_settings (key, value)
values ('tip_min_amount_yen', '100'::jsonb)
on conflict (key) do nothing;

create index if not exists tips_stripe_payment_intent_id_idx
  on public.tips (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists tips_connected_account_idx
  on public.tips (connected_account_id, created_at desc)
  where connected_account_id is not null;
create index if not exists tips_stripe_charge_idx
  on public.tips (stripe_charge_id)
  where stripe_charge_id is not null;

alter table public.merch_orders
  add column if not exists gross_amount_yen integer,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists connected_account_id text,
  add column if not exists stripe_checkout_mode text,
  add column if not exists stripe_application_fee_id text,
  add column if not exists refunded_amount_yen integer not null default 0,
  add column if not exists dispute_status text,
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_closed_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists paid_at timestamptz,
  add column if not exists seller_responsibility text;

update public.merch_orders
set
  gross_amount_yen = coalesce(gross_amount_yen, amount_yen),
  stripe_payment_intent_id = coalesce(stripe_payment_intent_id, stripe_payment_intent)
where gross_amount_yen is null
  or (stripe_payment_intent_id is null and stripe_payment_intent is not null);

create index if not exists merch_orders_stripe_payment_intent_id_idx
  on public.merch_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists merch_orders_connected_account_idx
  on public.merch_orders (connected_account_id, created_at desc)
  where connected_account_id is not null;
create index if not exists merch_orders_stripe_charge_idx
  on public.merch_orders (stripe_charge_id)
  where stripe_charge_id is not null;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  connected_account_id text,
  source text not null default 'platform',
  object_id text,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_webhook_events enable row level security;

drop policy if exists stripe_webhook_events_admin_read on public.stripe_webhook_events;
create policy stripe_webhook_events_admin_read on public.stripe_webhook_events
  for select using (public.is_admin());

grant select on public.stripe_webhook_events to authenticated;

create or replace view public.platform_payment_summary as
select
  coalesce((select sum(coalesce(gross_amount_yen, amount_cents, 0)) from public.tips where status = 'succeeded'), 0) as tip_gmv_yen,
  coalesce((select sum(coalesce(platform_fee_yen, platform_fee_cents, 0)) from public.tips where status = 'succeeded'), 0) as tip_platform_fee_yen,
  coalesce((select count(*) from public.tips where status = 'succeeded'), 0) as tip_count,
  coalesce((select sum(coalesce(refunded_amount_yen, 0)) from public.tips), 0) as tip_refunded_yen,
  coalesce((select count(*) from public.tips where dispute_status is not null), 0) as tip_dispute_count,
  coalesce((select sum(coalesce(gross_amount_yen, amount_yen, 0)) from public.merch_orders where status = 'succeeded'), 0) as merch_gmv_yen,
  coalesce((select sum(coalesce(platform_fee_yen, 0)) from public.merch_orders where status = 'succeeded'), 0) as merch_platform_fee_yen,
  coalesce((select count(*) from public.merch_orders where status = 'succeeded'), 0) as merch_order_count,
  coalesce((select sum(coalesce(refunded_amount_yen, 0)) from public.merch_orders), 0) as merch_refunded_yen,
  coalesce((select count(*) from public.merch_orders where dispute_status is not null), 0) as merch_dispute_count;

revoke all on public.platform_payment_summary from anon, authenticated;
