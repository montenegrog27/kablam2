alter table public.products
add column if not exists pricing_mode text not null default 'unit';

alter table public.products
drop constraint if exists products_pricing_mode_check;

alter table public.products
add constraint products_pricing_mode_check
check (pricing_mode in ('unit', 'kg', 'portion'));

alter table public.product_variants
add column if not exists sort_order integer not null default 0;

update public.products
set pricing_mode = 'unit'
where pricing_mode is null;

update public.product_variants
set sort_order = 0
where sort_order is null;
