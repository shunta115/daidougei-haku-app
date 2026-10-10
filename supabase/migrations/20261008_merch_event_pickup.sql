-- Event pickup + cash reservation support for merch.
-- Additive only. Existing orders, payments and Stripe settlement data are untouched.

begin;
set local lock_timeout = '5s';

alter table public.merch_products
  add column if not exists pickup_location text,
  add column if not exists pickup_deadline timestamptz,
  add column if not exists reservation_enabled boolean not null default false;

alter table public.merch_orders
  add column if not exists order_kind text not null default 'cashless'
    check (order_kind in ('cashless', 'cash_reservation')),
  add column if not exists order_number text,
  add column if not exists fulfillment_status text not null default 'awaiting_payment'
    check (fulfillment_status in ('awaiting_payment', 'awaiting_pickup', 'fulfilled', 'cancelled', 'expired')),
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cash_received_at timestamptz;

create unique index if not exists merch_orders_order_number_unique
  on public.merch_orders (order_number) where order_number is not null;
create index if not exists merch_orders_open_pickup_idx
  on public.merch_orders (seller_id, fulfillment_status, created_at desc);
create index if not exists merch_orders_reservation_expiry_idx
  on public.merch_orders (reservation_expires_at)
  where order_kind = 'cash_reservation' and fulfillment_status = 'awaiting_pickup';

create or replace function public.create_merch_cash_reservation(
  p_order_id uuid,
  p_buyer_id uuid,
  p_product_id uuid,
  p_quantity integer
) returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.merch_products%rowtype;
  v_buyer public.profiles%rowtype;
  v_existing public.merch_orders%rowtype;
  v_number text;
  v_deadline timestamptz;
begin
  if p_quantity < 1 or p_quantity > 20 then
    raise exception 'invalid_quantity';
  end if;

  select * into v_existing from public.merch_orders where id = p_order_id;
  if found then
    if v_existing.buyer_id = p_buyer_id
       and v_existing.product_id = p_product_id
       and v_existing.quantity = p_quantity
       and v_existing.order_kind = 'cash_reservation' then
      return query select v_existing.id, v_existing.order_number;
      return;
    end if;
    raise exception 'request_id_conflict';
  end if;

  select * into v_buyer from public.profiles where id = p_buyer_id;
  if not found or v_buyer.status in ('suspended', 'deleted') then
    raise exception 'invalid_buyer';
  end if;

  select * into v_product from public.merch_products where id = p_product_id for update;
  if not found or v_product.status <> 'active' or not v_product.reservation_enabled
     or v_product.stock < p_quantity then
    raise exception 'product_unavailable';
  end if;
  if not exists (
    select 1 from public.performers p
    where p.id = v_product.seller_id and p.is_approved = true
  ) then
    raise exception 'seller_unavailable';
  end if;

  v_number := 'R-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 12));
  v_deadline := coalesce(v_product.pickup_deadline, now() + interval '24 hours');
  if v_deadline <= now() then raise exception 'product_unavailable'; end if;

  insert into public.merch_orders (
    id, buyer_id, seller_id, product_id, buyer_display_name, buyer_email,
    product_name, product_image_url, unit_price_yen, quantity, amount_yen,
    currency, platform_fee_yen, status, order_kind, order_number,
    fulfillment_status, reservation_expires_at
  ) values (
    p_order_id, p_buyer_id, v_product.seller_id, v_product.id,
    coalesce(nullif(v_buyer.display_name, ''), 'お客様'), v_buyer.email,
    v_product.name, v_product.image_url, v_product.price_yen, p_quantity,
    v_product.price_yen * p_quantity, 'jpy', 0, 'pending',
    'cash_reservation', v_number, 'awaiting_pickup', v_deadline
  );

  update public.merch_products
  set stock = stock - p_quantity,
      status = case when stock - p_quantity = 0 then 'sold_out' else status end
  where id = v_product.id;

  return query select p_order_id, v_number;
end;
$$;

create or replace function public.update_merch_handoff(
  p_order_id uuid,
  p_actor_id uuid,
  p_action text
) returns table(order_id uuid, fulfillment_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.merch_orders%rowtype;
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.admin_members am
    where am.user_id = p_actor_id and am.status = 'active'
  ) into v_is_admin;

  select * into v_order from public.merch_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  if p_actor_id <> v_order.seller_id and not v_is_admin
     and not (p_action = 'cancel' and p_actor_id = v_order.buyer_id) then
    raise exception 'not_authorized';
  end if;

  if p_action = 'fulfill' then
    if v_order.fulfillment_status = 'fulfilled' then
      return query select v_order.id, v_order.fulfillment_status;
      return;
    end if;
    if v_order.fulfillment_status <> 'awaiting_pickup' then raise exception 'not_ready_for_handoff'; end if;
    if v_order.order_kind = 'cashless' and v_order.status <> 'succeeded' then
      raise exception 'payment_not_confirmed';
    end if;
    update public.merch_orders set
      fulfillment_status = 'fulfilled',
      fulfilled_at = now(),
      cash_received_at = case when order_kind = 'cash_reservation' then now() else cash_received_at end
    where id = v_order.id;
  elsif p_action in ('cancel', 'expire') then
    if v_order.order_kind <> 'cash_reservation' then raise exception 'cash_reservation_only'; end if;
    if v_order.fulfillment_status in ('cancelled', 'expired') then
      return query select v_order.id, v_order.fulfillment_status;
      return;
    end if;
    if v_order.fulfillment_status <> 'awaiting_pickup' then raise exception 'reservation_not_open'; end if;
    if p_action = 'expire' and v_order.reservation_expires_at > now() then
      raise exception 'reservation_not_expired';
    end if;
    update public.merch_orders set
      fulfillment_status = case when p_action = 'expire' then 'expired' else 'cancelled' end,
      status = case when p_action = 'expire' then 'expired' else 'failed' end,
      cancelled_at = now()
    where id = v_order.id;
    update public.merch_products set
      stock = stock + v_order.quantity,
      status = case when status = 'sold_out' then 'active' else status end
    where id = v_order.product_id;
  else
    raise exception 'invalid_action';
  end if;

  return query select o.id, o.fulfillment_status from public.merch_orders o where o.id = v_order.id;
end;
$$;

create or replace function public.expire_due_merch_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id, product_id, quantity
    from public.merch_orders
    where order_kind = 'cash_reservation'
      and fulfillment_status = 'awaiting_pickup'
      and reservation_expires_at <= now()
    for update skip locked
  loop
    update public.merch_orders
    set fulfillment_status = 'expired', status = 'expired', cancelled_at = now()
    where id = v_order.id and fulfillment_status = 'awaiting_pickup';
    if found then
      update public.merch_products
      set stock = stock + v_order.quantity,
          status = case when status = 'sold_out' then 'active' else status end
      where id = v_order.product_id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.create_merch_cash_reservation(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.update_merch_handoff(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.expire_due_merch_reservations() from public, anon, authenticated;
grant execute on function public.create_merch_cash_reservation(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.update_merch_handoff(uuid, uuid, text) to service_role;
grant execute on function public.expire_due_merch_reservations() to service_role;

commit;
