create table if not exists public.financial_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  monthly_rent numeric not null default 0,
  monthly_gas numeric not null default 0,
  monthly_electricity numeric not null default 0,
  monthly_internet numeric not null default 0,
  monthly_payroll numeric not null default 0,
  operating_days_per_month integer not null default 26,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

alter table public.financial_settings enable row level security;

drop policy if exists "financial_settings_tenant_select" on public.financial_settings;
create policy "financial_settings_tenant_select"
on public.financial_settings for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "financial_settings_tenant_insert" on public.financial_settings;
create policy "financial_settings_tenant_insert"
on public.financial_settings for insert
with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "financial_settings_tenant_update" on public.financial_settings;
create policy "financial_settings_tenant_update"
on public.financial_settings for update
using (tenant_id = (select tenant_id from public.users where id = auth.uid()))
with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

alter table public.packaging
add column if not exists consumption_type text not null default 'PER_PRODUCT',
add column if not exists rule jsonb;

alter table public.packaging
drop constraint if exists packaging_consumption_type_check;

alter table public.packaging
add constraint packaging_consumption_type_check
check (consumption_type in ('PER_PRODUCT', 'PER_ORDER', 'CUSTOM_RULE'));
