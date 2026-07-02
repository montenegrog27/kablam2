-- Stock / inventory module
-- Run this in Supabase SQL editor before using the Stock section.

alter table public.products
  add column if not exists manages_stock boolean not null default false,
  add column if not exists stock_unit text not null default 'unit',
  add column if not exists stock_low_threshold numeric not null default 0;

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  current_quantity numeric not null default 0,
  unit text not null default 'unit',
  low_threshold numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (branch_id, product_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid null,
  catalog_order_id uuid null,
  movement_type text not null check (movement_type in ('sale', 'sale_reversal', 'adjustment', 'purchase', 'waste', 'transfer_in', 'transfer_out')),
  quantity_delta numeric not null,
  quantity_before numeric not null,
  quantity_after numeric not null,
  unit text not null default 'unit',
  reason text null,
  created_by uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_movements_order_once
  on public.stock_movements(order_id, product_id, movement_type)
  where order_id is not null and movement_type in ('sale', 'sale_reversal');

create unique index if not exists stock_movements_catalog_order_once
  on public.stock_movements(catalog_order_id, product_id, movement_type)
  where catalog_order_id is not null and movement_type in ('sale', 'sale_reversal');

create index if not exists stock_items_tenant_branch_idx
  on public.stock_items(tenant_id, branch_id);

create index if not exists stock_movements_tenant_created_idx
  on public.stock_movements(tenant_id, created_at desc);

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stock_items' and policyname = 'stock_items_authenticated_all'
  ) then
    create policy stock_items_authenticated_all
    on public.stock_items
    for all
    to authenticated
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stock_movements' and policyname = 'stock_movements_authenticated_all'
  ) then
    create policy stock_movements_authenticated_all
    on public.stock_movements
    for all
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;
