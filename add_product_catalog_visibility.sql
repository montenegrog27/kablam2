-- Visibilidad independiente de productos por canal.
-- Delivery usa products.show_in_menu.
-- Local QR usa products.qr_visible.
-- Catalogo usa products.catalog_visible.

alter table public.products
  add column if not exists catalog_visible boolean not null default true;

create index if not exists idx_products_catalog_visibility
  on public.products (branch_id, catalog_visible, is_active);
