alter table public.categories
  add column if not exists kds_sort_order integer not null default 0,
  add column if not exists kds_dimmed boolean not null default false;

create index if not exists categories_kds_sort_idx
  on public.categories (tenant_id, kds_sort_order, position);
