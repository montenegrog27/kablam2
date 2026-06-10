create table if not exists public.mercadopago_treasury_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_label text not null default 'Mercado Pago',
  real_balance numeric(12, 2) not null default 0,
  last_balance_at timestamptz,
  oauth_status text not null default 'not_connected',
  external_user_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table if not exists public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  access_token text,
  public_key text,
  client_id text,
  client_secret text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists public.mercadopago_account_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_id text,
  operation_date timestamptz not null,
  description text not null,
  operation_type text,
  amount numeric(12, 2) not null,
  balance_after numeric(12, 2),
  counterparty text,
  reference text,
  status text not null default 'pending',
  central_cash_movement_id uuid references public.central_cash_movements(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  debt_id uuid references public.financial_debts(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

create index if not exists mercadopago_movements_tenant_date_idx
on public.mercadopago_account_movements(tenant_id, operation_date desc);

create index if not exists mercadopago_movements_status_idx
on public.mercadopago_account_movements(tenant_id, status);

alter table public.mercadopago_treasury_settings enable row level security;
alter table public.mercadopago_account_movements enable row level security;
alter table public.tenant_integrations enable row level security;

drop policy if exists "tenant_integrations_owner_admin_select" on public.tenant_integrations;
create policy "tenant_integrations_owner_admin_select"
on public.tenant_integrations for select
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

drop policy if exists "tenant_integrations_owner_admin_all" on public.tenant_integrations;
create policy "tenant_integrations_owner_admin_all"
on public.tenant_integrations for all
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
)
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

drop policy if exists "mercadopago_treasury_settings_tenant_select" on public.mercadopago_treasury_settings;
create policy "mercadopago_treasury_settings_tenant_select"
on public.mercadopago_treasury_settings for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "mercadopago_treasury_settings_owner_admin_all" on public.mercadopago_treasury_settings;
create policy "mercadopago_treasury_settings_owner_admin_all"
on public.mercadopago_treasury_settings for all
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
)
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

drop policy if exists "mercadopago_account_movements_tenant_select" on public.mercadopago_account_movements;
create policy "mercadopago_account_movements_tenant_select"
on public.mercadopago_account_movements for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "mercadopago_account_movements_owner_admin_all" on public.mercadopago_account_movements;
create policy "mercadopago_account_movements_owner_admin_all"
on public.mercadopago_account_movements for all
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
)
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

insert into public.permissions (module, key, name, description)
values
  ('admin', 'admin.mercadopago.view', 'Ver Mercado Pago', 'Permite ver saldo, movimientos y conciliacion de Mercado Pago.'),
  ('admin', 'admin.mercadopago.manage', 'Gestionar Mercado Pago', 'Permite importar movimientos, conciliar y crear ajustes desde Mercado Pago.')
on conflict (key) do update
set module = excluded.module,
    name = excluded.name,
    description = excluded.description;
