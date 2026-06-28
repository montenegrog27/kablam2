-- Assign one or more users to each cash register.
-- Run this in Supabase SQL editor.

create table if not exists public.user_cash_registers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  cash_register_id uuid not null references public.cash_registers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, cash_register_id)
);

create index if not exists idx_user_cash_registers_tenant
  on public.user_cash_registers (tenant_id);

create index if not exists idx_user_cash_registers_user
  on public.user_cash_registers (user_id);

create index if not exists idx_user_cash_registers_register
  on public.user_cash_registers (cash_register_id);

alter table public.user_cash_registers enable row level security;

drop policy if exists "user_cash_registers_select_tenant" on public.user_cash_registers;
create policy "user_cash_registers_select_tenant"
on public.user_cash_registers
for select
using (
  tenant_id in (
    select tenant_id
    from public.users
    where id = auth.uid()
  )
);

drop policy if exists "user_cash_registers_insert_tenant" on public.user_cash_registers;
create policy "user_cash_registers_insert_tenant"
on public.user_cash_registers
for insert
with check (
  tenant_id in (
    select tenant_id
    from public.users
    where id = auth.uid()
  )
);

drop policy if exists "user_cash_registers_update_tenant" on public.user_cash_registers;
create policy "user_cash_registers_update_tenant"
on public.user_cash_registers
for update
using (
  tenant_id in (
    select tenant_id
    from public.users
    where id = auth.uid()
  )
)
with check (
  tenant_id in (
    select tenant_id
    from public.users
    where id = auth.uid()
  )
);

drop policy if exists "user_cash_registers_delete_tenant" on public.user_cash_registers;
create policy "user_cash_registers_delete_tenant"
on public.user_cash_registers
for delete
using (
  tenant_id in (
    select tenant_id
    from public.users
    where id = auth.uid()
  )
);
