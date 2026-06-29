-- Catalog order date window settings.
-- Run in Supabase SQL editor.

alter table public.branch_settings
  add column if not exists catalog_order_advance_days integer default 10,
  add column if not exists catalog_order_min_advance_days integer default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_settings_catalog_order_advance_days_check'
  ) then
    alter table public.branch_settings
      add constraint branch_settings_catalog_order_advance_days_check
      check (catalog_order_advance_days is null or catalog_order_advance_days between 1 and 60)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_settings_catalog_order_min_advance_days_check'
  ) then
    alter table public.branch_settings
      add constraint branch_settings_catalog_order_min_advance_days_check
      check (catalog_order_min_advance_days is null or catalog_order_min_advance_days between 0 and 60)
      not valid;
  end if;
end $$;
