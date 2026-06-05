create table if not exists public.central_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  name text not null,
  balance numeric(12, 2) not null default 0,
  branch_id uuid references public.branches(id) on delete set null,
  cash_register_id uuid references public.cash_registers(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, type, name)
);

alter table public.central_cash_accounts
drop constraint if exists central_cash_accounts_type_check;

alter table public.central_cash_accounts
add column if not exists branch_id uuid references public.branches(id) on delete set null,
add column if not exists cash_register_id uuid references public.cash_registers(id) on delete set null;

alter table public.central_cash_accounts
add constraint central_cash_accounts_type_check
check (type in ('cash', 'petty_cash', 'transfer', 'bank', 'mercadopago', 'other'));

create table if not exists public.central_cash_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  account_id uuid not null references public.central_cash_accounts(id) on delete restrict,
  cash_closure_id uuid references public.cash_closures(id) on delete set null,
  cash_session_id uuid references public.cash_sessions(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  type text not null,
  amount numeric(12, 2) not null,
  description text not null,
  payment_method_name text,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.central_cash_movements
drop constraint if exists central_cash_movements_type_check;

alter table public.central_cash_movements
add constraint central_cash_movements_type_check
check (type in ('cash_closure_in', 'expense_out', 'manual_in', 'manual_out', 'adjustment', 'transfer_in', 'transfer_out', 'petty_cash_balance'));

create index if not exists central_cash_accounts_tenant_idx
on public.central_cash_accounts(tenant_id);

create index if not exists central_cash_accounts_register_idx
on public.central_cash_accounts(tenant_id, cash_register_id)
where cash_register_id is not null;

create index if not exists central_cash_movements_tenant_created_idx
on public.central_cash_movements(tenant_id, created_at desc);

alter table public.expenses
add column if not exists cash_register_id uuid references public.cash_registers(id) on delete set null,
add column if not exists created_by uuid references auth.users(id) on delete set null,
add column if not exists paid_from_central boolean not null default false,
add column if not exists central_cash_movement_id uuid references public.central_cash_movements(id) on delete set null;

alter table public.central_cash_accounts enable row level security;
alter table public.central_cash_movements enable row level security;

drop policy if exists "central_cash_accounts_tenant_select" on public.central_cash_accounts;
create policy "central_cash_accounts_tenant_select"
on public.central_cash_accounts for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "central_cash_accounts_owner_admin_all" on public.central_cash_accounts;
create policy "central_cash_accounts_owner_admin_all"
on public.central_cash_accounts for all
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
)
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

drop policy if exists "central_cash_movements_tenant_select" on public.central_cash_movements;
create policy "central_cash_movements_tenant_select"
on public.central_cash_movements for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "central_cash_movements_owner_admin_insert" on public.central_cash_movements;
create policy "central_cash_movements_owner_admin_insert"
on public.central_cash_movements for insert
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

insert into public.permissions (module, key, name, description)
values
  ('cashier', 'cashier.expenses.view', 'Ver gastos de caja', 'Permite ver gastos registrados en la caja operativa.'),
  ('cashier', 'cashier.expenses.create', 'Crear gastos de caja', 'Permite registrar gastos que descuentan efectivo de la caja operativa.'),
  ('cashier', 'cashier.expenses.delete', 'Eliminar gastos de caja', 'Permite eliminar gastos registrados en la caja operativa.')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    module = excluded.module;

create or replace function public.ensure_central_cash_account(
  p_tenant_id uuid,
  p_type text,
  p_name text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_account_id uuid;
begin
  insert into public.central_cash_accounts (tenant_id, type, name)
  values (p_tenant_id, p_type, p_name)
  on conflict (tenant_id, type, name)
  do update set updated_at = now()
  returning id into v_account_id;

  return v_account_id;
end;
$$;

create or replace function public.ensure_petty_cash_account(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_cash_register_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_account_id uuid;
begin
  select id into v_account_id
  from public.central_cash_accounts
  where tenant_id = p_tenant_id
    and type = 'petty_cash'
    and cash_register_id = p_cash_register_id
  limit 1;

  if v_account_id is not null then
    update public.central_cash_accounts
    set branch_id = p_branch_id,
        name = coalesce(nullif(p_name, ''), name),
        updated_at = now()
    where id = v_account_id;
    return v_account_id;
  end if;

  insert into public.central_cash_accounts (
    tenant_id,
    branch_id,
    cash_register_id,
    type,
    name
  )
  values (
    p_tenant_id,
    p_branch_id,
    p_cash_register_id,
    'petty_cash',
    coalesce(nullif(p_name, ''), 'Caja chica')
  )
  returning id into v_account_id;

  return v_account_id;
end;
$$;

create or replace function public.apply_central_cash_movement(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_account_id uuid,
  p_cash_closure_id uuid,
  p_cash_session_id uuid,
  p_expense_id uuid,
  p_type text,
  p_amount numeric,
  p_description text,
  p_payment_method_name text,
  p_created_by uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_movement_id uuid;
  v_delta numeric;
begin
  if coalesce(p_amount, 0) <= 0 then
    return null;
  end if;

  if p_cash_closure_id is null and coalesce((select role from public.users where id = auth.uid()), '') not in ('owner', 'admin') then
    raise exception 'permission denied for central cash movement';
  end if;

  v_delta := case when p_type in ('expense_out', 'manual_out', 'transfer_out') then -p_amount else p_amount end;

  insert into public.central_cash_movements (
    tenant_id,
    branch_id,
    account_id,
    cash_closure_id,
    cash_session_id,
    expense_id,
    type,
    amount,
    description,
    payment_method_name,
    created_by,
    metadata
  )
  values (
    p_tenant_id,
    p_branch_id,
    p_account_id,
    p_cash_closure_id,
    p_cash_session_id,
    p_expense_id,
    p_type,
    p_amount,
    p_description,
    p_payment_method_name,
    p_created_by,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_movement_id;

  update public.central_cash_accounts
  set balance = balance + v_delta,
      updated_at = now()
  where id = p_account_id;

  return v_movement_id;
end;
$$;

create or replace function public.close_cash_session_atomic(
  p_cash_session_id uuid,
  p_closed_by uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_closure_id uuid;
  v_tenant_id uuid;
  v_branch_id uuid;
  v_cash_account_id uuid;
  v_petty_account_id uuid;
  v_transfer_account_id uuid;
  v_cash_deposit numeric;
  v_carry_over numeric;
  v_payment jsonb;
  v_payment_name text;
  v_payment_amount numeric;
begin
  perform 1
  from public.cash_sessions
  where id = p_cash_session_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'cash session is not open';
  end if;

  v_tenant_id := (p_snapshot->>'tenant_id')::uuid;
  v_branch_id := (p_snapshot->>'branch_id')::uuid;

  insert into public.cash_closures (
    tenant_id,
    branch_id,
    cash_register_id,
    cash_session_id,
    opened_by,
    closed_by,
    opened_at,
    closed_at,
    carry_over,
    bills_detail,
    opening_amount,
    closing_amount,
    expected_cash,
    difference,
    difference_reason,
    total_revenue,
    total_without_shipping,
    total_shipping,
    total_orders,
    total_units,
    total_cost,
    profit,
    payments,
    payment_verification,
    products,
    cash_movements
  )
  values (
    v_tenant_id,
    v_branch_id,
    (p_snapshot->>'cash_register_id')::uuid,
    p_cash_session_id,
    (p_snapshot->>'opened_by')::uuid,
    p_closed_by,
    (p_snapshot->>'opened_at')::timestamptz,
    (p_snapshot->>'closed_at')::timestamptz,
    coalesce((p_snapshot->>'carry_over')::numeric, 0),
    coalesce(p_snapshot->'bills_detail', '{}'::jsonb),
    coalesce((p_snapshot->>'opening_amount')::numeric, 0),
    coalesce((p_snapshot->>'closing_amount')::numeric, 0),
    coalesce((p_snapshot->>'expected_cash')::numeric, 0),
    coalesce((p_snapshot->>'difference')::numeric, 0),
    nullif(p_snapshot->>'difference_reason', ''),
    coalesce((p_snapshot->>'total_revenue')::numeric, 0),
    coalesce((p_snapshot->>'total_without_shipping')::numeric, 0),
    coalesce((p_snapshot->>'total_shipping')::numeric, 0),
    coalesce((p_snapshot->>'total_orders')::integer, 0),
    coalesce((p_snapshot->>'total_units')::integer, 0),
    coalesce((p_snapshot->>'total_cost')::numeric, 0),
    coalesce((p_snapshot->>'profit')::numeric, 0),
    coalesce(p_snapshot->'payments', '{}'::jsonb),
    coalesce(p_snapshot->'payment_verification', '{}'::jsonb),
    coalesce(p_snapshot->'products', '{}'::jsonb),
    coalesce(p_snapshot->'cash_movements', '{}'::jsonb)
  )
  returning id into v_closure_id;

  update public.cash_sessions
  set
    status = 'closed',
    closed_at = (p_snapshot->>'closed_at')::timestamptz,
    closed_by = p_closed_by,
    closing_amount = coalesce((p_snapshot->>'closing_amount')::numeric, 0),
    difference = coalesce((p_snapshot->>'difference')::numeric, 0),
    difference_reason = nullif(p_snapshot->>'difference_reason', '')
  where id = p_cash_session_id;

  v_cash_deposit := greatest(
    coalesce((p_snapshot->>'closing_amount')::numeric, 0) -
    coalesce((p_snapshot->>'carry_over')::numeric, 0),
    0
  );
  v_carry_over := greatest(coalesce((p_snapshot->>'carry_over')::numeric, 0), 0);

  v_cash_account_id := public.ensure_central_cash_account(v_tenant_id, 'cash', 'Efectivo central');
  v_transfer_account_id := public.ensure_central_cash_account(v_tenant_id, 'transfer', 'Transferencias / MercadoPago');
  v_petty_account_id := public.ensure_petty_cash_account(
    v_tenant_id,
    v_branch_id,
    (p_snapshot->>'cash_register_id')::uuid,
    'Caja chica - ' || coalesce(p_snapshot->>'cash_register_name', p_snapshot->>'cash_register_id')
  );

  perform public.apply_central_cash_movement(
    v_tenant_id,
    v_branch_id,
    v_cash_account_id,
    v_closure_id,
    p_cash_session_id,
    null,
    'cash_closure_in',
    v_cash_deposit,
    'Cierre de caja - efectivo',
    'Efectivo',
    p_closed_by,
    jsonb_build_object('carry_over', coalesce((p_snapshot->>'carry_over')::numeric, 0))
  );

  insert into public.central_cash_movements (
    tenant_id,
    branch_id,
    account_id,
    cash_closure_id,
    cash_session_id,
    type,
    amount,
    description,
    payment_method_name,
    created_by,
    metadata
  )
  values (
    v_tenant_id,
    v_branch_id,
    v_petty_account_id,
    v_closure_id,
    p_cash_session_id,
    'petty_cash_balance',
    v_carry_over,
    'Cierre de caja - saldo caja chica',
    'Caja chica',
    p_closed_by,
    jsonb_build_object(
      'cash_register_id', p_snapshot->>'cash_register_id',
      'closing_amount', coalesce((p_snapshot->>'closing_amount')::numeric, 0),
      'central_cash_deposit', v_cash_deposit
    )
  );

  update public.central_cash_accounts
  set balance = v_carry_over,
      updated_at = now()
  where id = v_petty_account_id;

  for v_payment_name, v_payment in
    select key, value
    from jsonb_each(coalesce(p_snapshot->'payment_verification', '{}'::jsonb))
  loop
    v_payment_amount := coalesce((v_payment->>'counted')::numeric, (v_payment->>'expected')::numeric, 0);
    perform public.apply_central_cash_movement(
      v_tenant_id,
      v_branch_id,
      v_transfer_account_id,
      v_closure_id,
      p_cash_session_id,
      null,
      'cash_closure_in',
      v_payment_amount,
      'Cierre de caja - ' || v_payment_name,
      v_payment_name,
      p_closed_by,
      jsonb_build_object('payment_verification', v_payment)
    );
  end loop;

  return v_closure_id;
end;
$$;

grant execute on function public.close_cash_session_atomic(uuid, uuid, jsonb) to authenticated;
grant execute on function public.ensure_central_cash_account(uuid, text, text) to authenticated;
grant execute on function public.apply_central_cash_movement(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, text, uuid, jsonb) to authenticated;
grant execute on function public.ensure_petty_cash_account(uuid, uuid, uuid, text) to authenticated;
