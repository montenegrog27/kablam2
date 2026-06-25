-- Permite que un popup de customer muestre promociones activas seleccionadas.
-- Ejecutar en Supabase SQL Editor antes de usar el modo "promociones".

alter table public.customer_popups
  add column if not exists show_promotions boolean not null default false,
  add column if not exists promotion_ids uuid[] not null default '{}';

alter table public.customer_popups
  alter column image_url drop not null;

create index if not exists idx_customer_popups_promotion_ids
  on public.customer_popups using gin (promotion_ids);
