alter table public.flash_sales
  add column if not exists show_in_qr boolean not null default true,
  add column if not exists show_in_catalog boolean not null default true,
  add column if not exists show_in_order boolean not null default true;

create index if not exists idx_flash_sales_channels
  on public.flash_sales (tenant_id, branch_id, is_active, show_in_qr, show_in_catalog, show_in_order, start_at, end_at);
