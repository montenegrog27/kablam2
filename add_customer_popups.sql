-- Popups configurables para customer.
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.customer_popups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid null references public.branches(id) on delete cascade,
  name text not null,
  description text,
  image_url text not null,
  link_url text,
  active boolean not null default true,
  schedule_type text not null default 'all_days',
  days_of_week integer[],
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_popups_schedule_type_check check (schedule_type in ('all_days', 'specific_days')),
  constraint customer_popups_days_check check (
    days_of_week is null
    or array_length(days_of_week, 1) is null
    or days_of_week <@ array[0,1,2,3,4,5,6]
  )
);

create index if not exists idx_customer_popups_tenant_active
  on public.customer_popups (tenant_id, active, priority);

create index if not exists idx_customer_popups_branch_active
  on public.customer_popups (branch_id, active, priority);

alter table public.customer_popups enable row level security;

drop policy if exists customer_popups_authenticated_select on public.customer_popups;
create policy customer_popups_authenticated_select on public.customer_popups
for select to authenticated
using (true);

drop policy if exists customer_popups_authenticated_insert on public.customer_popups;
create policy customer_popups_authenticated_insert on public.customer_popups
for insert to authenticated
with check (true);

drop policy if exists customer_popups_authenticated_update on public.customer_popups;
create policy customer_popups_authenticated_update on public.customer_popups
for update to authenticated
using (true)
with check (true);

drop policy if exists customer_popups_authenticated_delete on public.customer_popups;
create policy customer_popups_authenticated_delete on public.customer_popups
for delete to authenticated
using (true);

drop policy if exists customer_popups_service_all on public.customer_popups;
create policy customer_popups_service_all on public.customer_popups
for all to service_role
using (true)
with check (true);
