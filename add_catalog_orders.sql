alter table public.branch_settings
add column if not exists catalog_order_whatsapp_phone text,
add column if not exists catalog_order_deposit_enabled boolean not null default false,
add column if not exists catalog_order_deposit_percent numeric(5, 2) not null default 50,
add column if not exists catalog_order_transfer_alias text,
add column if not exists catalog_order_instructions text,
add column if not exists catalog_order_show_delivery_address boolean not null default true,
add column if not exists catalog_order_show_pickup_addresses boolean not null default false,
add column if not exists catalog_order_pickup_addresses jsonb not null default '[]'::jsonb;

create table if not exists public.catalog_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12, 2) not null default 0,
  quantity integer not null default 1,
  total numeric(12, 2) not null default 0,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  fulfillment_type text not null default 'delivery',
  pickup_address text,
  requested_date date not null,
  notes text,
  deposit_required boolean not null default false,
  deposit_percent numeric(5, 2) not null default 0,
  deposit_amount numeric(12, 2) not null default 0,
  transfer_alias text,
  status text not null default 'pending',
  customer_whatsapp_sent boolean not null default false,
  branch_whatsapp_sent boolean not null default false,
  customer_whatsapp_response jsonb,
  branch_whatsapp_response jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity > 0),
  check (fulfillment_type in ('delivery', 'pickup', 'coordinate')),
  check (status in ('pending', 'confirmed', 'rejected', 'completed', 'cancelled'))
);

alter table public.catalog_orders
add column if not exists fulfillment_type text not null default 'delivery',
add column if not exists pickup_address text;

alter table public.catalog_orders
drop constraint if exists catalog_orders_fulfillment_type_check;

alter table public.catalog_orders
add constraint catalog_orders_fulfillment_type_check
check (fulfillment_type in ('delivery', 'pickup', 'coordinate'));

create index if not exists catalog_orders_tenant_created_idx
on public.catalog_orders(tenant_id, created_at desc);

create index if not exists catalog_orders_branch_status_idx
on public.catalog_orders(branch_id, status, created_at desc);

alter table public.catalog_orders enable row level security;

drop policy if exists "catalog_orders_tenant_select" on public.catalog_orders;
create policy "catalog_orders_tenant_select"
on public.catalog_orders for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "catalog_orders_owner_admin_all" on public.catalog_orders;
create policy "catalog_orders_owner_admin_all"
on public.catalog_orders for all
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
)
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

insert into public.permissions (module, key, name, description)
values
  ('admin', 'admin.catalog_orders.view', 'Ver encargos de catalogo', 'Permite ver los encargos recibidos desde el catalogo.'),
  ('admin', 'admin.catalog_orders.manage', 'Gestionar encargos de catalogo', 'Permite configurar y gestionar encargos recibidos desde el catalogo.')
on conflict (key) do update
set module = excluded.module,
    name = excluded.name,
    description = excluded.description;
