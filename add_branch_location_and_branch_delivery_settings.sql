alter table public.branches
  add column if not exists address text,
  add column if not exists lat numeric,
  add column if not exists lng numeric;

alter table public.delivery_settings
  add column if not exists branch_id uuid references public.branches(id) on delete cascade;

alter table public.delivery_settings
  drop constraint if exists delivery_settings_tenant_id_key;

drop index if exists delivery_settings_tenant_id_key;

create index if not exists idx_delivery_settings_tenant_branch
  on public.delivery_settings(tenant_id, branch_id);

create unique index if not exists delivery_settings_one_global_per_tenant
  on public.delivery_settings(tenant_id)
  where branch_id is null;

create unique index if not exists delivery_settings_one_per_branch
  on public.delivery_settings(tenant_id, branch_id)
  where branch_id is not null;
