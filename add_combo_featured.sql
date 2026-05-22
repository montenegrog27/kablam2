alter table public.combos
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_order integer;
