-- WhatsApp Meta numbers per tenant/branch.
-- This lets each tenant or branch send/receive through its own Meta phone_number_id.

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  phone_number text,
  phone_number_id text not null,
  access_token text not null,
  waba_id text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_numbers_branch_id_key
  on public.whatsapp_numbers (branch_id)
  where branch_id is not null;

create unique index if not exists whatsapp_numbers_phone_number_id_key
  on public.whatsapp_numbers (phone_number_id);

create index if not exists whatsapp_numbers_tenant_idx
  on public.whatsapp_numbers (tenant_id);

alter table public.whatsapp_numbers enable row level security;

drop policy if exists whatsapp_numbers_tenant_select on public.whatsapp_numbers;
create policy whatsapp_numbers_tenant_select
on public.whatsapp_numbers for select
using (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
);

drop policy if exists whatsapp_numbers_tenant_insert on public.whatsapp_numbers;
create policy whatsapp_numbers_tenant_insert
on public.whatsapp_numbers for insert
with check (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
);

drop policy if exists whatsapp_numbers_tenant_update on public.whatsapp_numbers;
create policy whatsapp_numbers_tenant_update
on public.whatsapp_numbers for update
using (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
)
with check (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
);

-- Current Meta phone_number_id values:
-- Mordisco: 583820924824095
-- Polemico: 1142378612298191
