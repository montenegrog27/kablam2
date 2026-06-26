-- Controles independientes de menu por canal.
-- QR:        categories.qr_*        + products.qr_*
-- Delivery:  categories.delivery_*  + products.delivery_position / products.show_in_menu
-- Catalogo:  categories.catalog_*   + products.catalog_*

alter table public.categories
  add column if not exists qr_visible boolean not null default true,
  add column if not exists qr_position integer,
  add column if not exists delivery_visible boolean not null default true,
  add column if not exists delivery_position integer,
  add column if not exists catalog_visible boolean not null default true,
  add column if not exists catalog_position integer;

alter table public.products
  add column if not exists qr_visible boolean not null default true,
  add column if not exists qr_position integer,
  add column if not exists delivery_position integer,
  add column if not exists catalog_visible boolean not null default true,
  add column if not exists catalog_position integer;

update public.categories
set
  qr_position = coalesce(qr_position, position, 0),
  delivery_position = coalesce(delivery_position, position, qr_position, 0),
  catalog_position = coalesce(catalog_position, position, qr_position, 0)
where qr_position is null
   or delivery_position is null
   or catalog_position is null;

with ranked as (
  select
    id,
    row_number() over (
      partition by branch_id, category_id
      order by coalesce(qr_position, 999999), name asc, id asc
    ) - 1 as position
  from public.products
)
update public.products p
set
  qr_position = coalesce(p.qr_position, ranked.position),
  delivery_position = coalesce(p.delivery_position, p.qr_position, ranked.position),
  catalog_position = coalesce(p.catalog_position, p.qr_position, ranked.position)
from ranked
where p.id = ranked.id
  and (
    p.qr_position is null
    or p.delivery_position is null
    or p.catalog_position is null
  );

create index if not exists idx_categories_qr_menu
  on public.categories (tenant_id, qr_visible, qr_position);

create index if not exists idx_categories_delivery_menu
  on public.categories (tenant_id, delivery_visible, delivery_position);

create index if not exists idx_categories_catalog_menu
  on public.categories (tenant_id, catalog_visible, catalog_position);

create index if not exists idx_products_qr_menu
  on public.products (branch_id, category_id, qr_visible, qr_position);

create index if not exists idx_products_delivery_menu
  on public.products (branch_id, category_id, show_in_menu, delivery_position);

create index if not exists idx_products_catalog_menu
  on public.products (branch_id, category_id, catalog_visible, catalog_position);
