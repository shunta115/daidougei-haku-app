-- Merch foundation: performer products, buyer orders, public product browsing.
-- Additive only. No DROP / DELETE / TRUNCATE of existing data.

create table if not exists public.merch_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.performers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  image_url text,
  price_yen integer not null check (price_yen between 100 and 1000000),
  stock integer not null default 0 check (stock >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'sold_out', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merch_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.performers (id) on delete cascade,
  product_id uuid not null references public.merch_products (id) on delete restrict,
  buyer_display_name text not null default '',
  buyer_email text,
  checkout_customer_email text,
  checkout_customer_name text,
  checkout_customer_phone text,
  checkout_shipping jsonb,
  product_name text not null,
  product_image_url text,
  unit_price_yen integer not null check (unit_price_yen > 0),
  quantity integer not null check (quantity between 1 and 20),
  amount_yen integer not null check (amount_yen > 0),
  currency text not null default 'jpy',
  platform_fee_yen integer not null default 0 check (platform_fee_yen >= 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'expired', 'refunded')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merch_orders
  add column if not exists buyer_display_name text not null default '',
  add column if not exists buyer_email text,
  add column if not exists checkout_customer_email text,
  add column if not exists checkout_customer_name text,
  add column if not exists checkout_customer_phone text,
  add column if not exists checkout_shipping jsonb;

create index if not exists merch_products_public_idx
  on public.merch_products (status, created_at desc);
create index if not exists merch_products_seller_idx
  on public.merch_products (seller_id, created_at desc);
create index if not exists merch_orders_buyer_idx
  on public.merch_orders (buyer_id, created_at desc);
create index if not exists merch_orders_seller_idx
  on public.merch_orders (seller_id, created_at desc);

insert into public.platform_settings (key, value)
values ('merch_fee_bps', '1000'::jsonb)
on conflict (key) do nothing;

alter table public.merch_products enable row level security;
alter table public.merch_orders enable row level security;

drop policy if exists merch_products_public_read on public.merch_products;
create policy merch_products_public_read on public.merch_products
  for select using (
    status in ('active', 'sold_out')
    or seller_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists merch_products_seller_insert on public.merch_products;
create policy merch_products_seller_insert on public.merch_products
  for insert with check (
    public.is_admin()
    or (
      seller_id = auth.uid()
      and (
        status <> 'active'
        or exists (select 1 from public.performers p where p.id = auth.uid() and p.is_approved)
      )
    )
  );

drop policy if exists merch_products_seller_update on public.merch_products;
create policy merch_products_seller_update on public.merch_products
  for update using (seller_id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      seller_id = auth.uid()
      and (
        status <> 'active'
        or exists (select 1 from public.performers p where p.id = auth.uid() and p.is_approved)
      )
    )
  );

drop policy if exists merch_orders_parties_read on public.merch_orders;
create policy merch_orders_parties_read on public.merch_orders
  for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

drop policy if exists merch_orders_admin_update on public.merch_orders;
create policy merch_orders_admin_update on public.merch_orders
  for update using (public.is_admin())
  with check (public.is_admin());

grant select on public.merch_products to anon, authenticated;
grant insert, update on public.merch_products to authenticated;
grant select on public.merch_orders to authenticated;

drop trigger if exists merch_products_updated on public.merch_products;
create trigger merch_products_updated before update on public.merch_products
for each row execute function public.set_updated_at();

drop trigger if exists merch_orders_updated on public.merch_orders;
create trigger merch_orders_updated before update on public.merch_orders
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merch',
  'merch',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists merch_public_read on storage.objects;
create policy merch_public_read on storage.objects
  for select using (bucket_id = 'merch');

drop policy if exists merch_seller_upload on storage.objects;
create policy merch_seller_upload on storage.objects
  for insert with check (
    bucket_id = 'merch' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists merch_seller_update on storage.objects;
create policy merch_seller_update on storage.objects
  for update using (
    bucket_id = 'merch' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists merch_seller_delete on storage.objects;
create policy merch_seller_delete on storage.objects
  for delete using (
    bucket_id = 'merch' and auth.uid()::text = (storage.foldername(name))[1]
  );
