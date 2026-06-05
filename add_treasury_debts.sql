alter table public.central_cash_movements
drop constraint if exists central_cash_movements_type_check;

alter table public.central_cash_movements
add column if not exists purchase_id uuid references public.purchases(id) on delete set null,
add column if not exists debt_id uuid;

alter table public.central_cash_movements
add constraint central_cash_movements_type_check
check (type in (
  'cash_closure_in',
  'expense_out',
  'purchase_out',
  'debt_payment_out',
  'debt_in',
  'manual_in',
  'manual_out',
  'adjustment',
  'transfer_in',
  'transfer_out',
  'petty_cash_balance'
));

create table if not exists public.financial_debts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  type text not null default 'account_payable',
  creditor_name text not null,
  title text not null,
  original_amount numeric(12, 2) not null,
  paid_amount numeric(12, 2) not null default 0,
  status text not null default 'open',
  source_type text,
  source_id uuid,
  due_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type in ('loan', 'account_payable', 'supplier_credit', 'manual')),
  check (status in ('open', 'partial', 'paid', 'cancelled'))
);

create table if not exists public.financial_debt_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  debt_id uuid not null references public.financial_debts(id) on delete cascade,
  account_id uuid references public.central_cash_accounts(id) on delete set null,
  amount numeric(12, 2) not null,
  payment_date date not null default current_date,
  notes text,
  central_cash_movement_id uuid references public.central_cash_movements(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'central_cash_movements'
      and constraint_name = 'central_cash_movements_debt_id_fkey'
  ) then
    alter table public.central_cash_movements
    add constraint central_cash_movements_debt_id_fkey
    foreign key (debt_id) references public.financial_debts(id) on delete set null;
  end if;
end $$;

create index if not exists financial_debts_tenant_status_idx
on public.financial_debts(tenant_id, status, due_date);

create index if not exists financial_debt_payments_debt_idx
on public.financial_debt_payments(debt_id, created_at desc);

alter table public.financial_debts enable row level security;
alter table public.financial_debt_payments enable row level security;

drop policy if exists "financial_debts_tenant_select" on public.financial_debts;
create policy "financial_debts_tenant_select"
on public.financial_debts for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "financial_debts_owner_admin_all" on public.financial_debts;
create policy "financial_debts_owner_admin_all"
on public.financial_debts for all
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
)
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

drop policy if exists "financial_debt_payments_tenant_select" on public.financial_debt_payments;
create policy "financial_debt_payments_tenant_select"
on public.financial_debt_payments for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "financial_debt_payments_owner_admin_insert" on public.financial_debt_payments;
create policy "financial_debt_payments_owner_admin_insert"
on public.financial_debt_payments for insert
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

insert into public.permissions (module, key, name, description)
values
  ('admin', 'admin.central_cash.view', 'Ver caja central', 'Permite ver saldos y movimientos de caja central.'),
  ('admin', 'admin.central_cash.manage', 'Gestionar caja central', 'Permite registrar pagos, compras, gastos, ajustes y transferencias.'),
  ('admin', 'admin.debts.view', 'Ver deudas', 'Permite ver prestamos y cuentas corrientes.'),
  ('admin', 'admin.debts.manage', 'Gestionar deudas', 'Permite crear deudas y registrar pagos.')
on conflict (key) do update
set module = excluded.module,
    name = excluded.name,
    description = excluded.description;
