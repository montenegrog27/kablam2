-- Cashier cash control setup.
-- Run this in the Supabase SQL editor before using manual cash movements.

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  cash_register_id uuid not null references public.cash_registers(id),
  cash_session_id uuid not null references public.cash_sessions(id),
  type text not null check (type in ('in', 'out')),
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.cash_movements
  add column if not exists tenant_id uuid,
  add column if not exists branch_id uuid,
  add column if not exists cash_register_id uuid,
  add column if not exists cash_session_id uuid,
  add column if not exists type text,
  add column if not exists amount numeric(12, 2),
  add column if not exists reason text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

create index if not exists cash_movements_session_idx
  on public.cash_movements(cash_session_id, created_at desc);

create index if not exists cash_movements_register_idx
  on public.cash_movements(cash_register_id, created_at desc);

alter table public.cash_closures
  add column if not exists tenant_id uuid,
  add column if not exists branch_id uuid,
  add column if not exists cash_register_id uuid,
  add column if not exists cash_session_id uuid,
  add column if not exists opened_by uuid,
  add column if not exists closed_by uuid,
  add column if not exists opened_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists carry_over numeric(12, 2) not null default 0,
  add column if not exists bills_detail jsonb not null default '{}'::jsonb,
  add column if not exists opening_amount numeric(12, 2) not null default 0,
  add column if not exists closing_amount numeric(12, 2) not null default 0,
  add column if not exists expected_cash numeric(12, 2) not null default 0,
  add column if not exists difference numeric(12, 2) not null default 0,
  add column if not exists difference_reason text,
  add column if not exists total_revenue numeric(12, 2) not null default 0,
  add column if not exists total_orders integer not null default 0,
  add column if not exists total_units integer not null default 0,
  add column if not exists total_cost numeric(12, 2) not null default 0,
  add column if not exists profit numeric(12, 2) not null default 0,
  add column if not exists payments jsonb not null default '{}'::jsonb,
  add column if not exists products jsonb not null default '{}'::jsonb,
  add column if not exists cash_movements jsonb not null default '{}'::jsonb,
  add column if not exists payment_verification jsonb not null default '{}'::jsonb,
  add column if not exists total_without_shipping numeric(12, 2) not null default 0,
  add column if not exists total_shipping numeric(12, 2) not null default 0;

alter table public.cash_sessions
  add column if not exists difference_reason text;

alter table public.orders
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  actor_id uuid references public.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on public.audit_logs(entity_type, entity_id, created_at desc);

create index if not exists audit_logs_tenant_idx
  on public.audit_logs(tenant_id, created_at desc);

create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  app text not null,
  severity text not null default 'error',
  code text,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_error_logs_app_idx
  on public.app_error_logs(app, created_at desc);

create index if not exists app_error_logs_tenant_idx
  on public.app_error_logs(tenant_id, created_at desc);

alter table public.cash_movements enable row level security;

drop policy if exists "cash_movements_select_authenticated" on public.cash_movements;
create policy "cash_movements_select_authenticated"
  on public.cash_movements
  for select
  to authenticated
  using (true);

drop policy if exists "cash_movements_insert_authenticated" on public.cash_movements;
create policy "cash_movements_insert_authenticated"
  on public.cash_movements
  for insert
  to authenticated
  with check (true);

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
begin
  perform 1
  from public.cash_sessions
  where id = p_cash_session_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'cash session is not open';
  end if;

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
    (p_snapshot->>'tenant_id')::uuid,
    (p_snapshot->>'branch_id')::uuid,
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

  return v_closure_id;
end;
$$;

grant execute on function public.close_cash_session_atomic(uuid, uuid, jsonb)
  to authenticated;

create or replace function public.log_app_error(
  p_app text,
  p_message text,
  p_severity text default 'error',
  p_code text default null,
  p_context jsonb default '{}'::jsonb,
  p_tenant_id uuid default null,
  p_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.app_error_logs (
    app,
    severity,
    code,
    message,
    context,
    tenant_id,
    branch_id
  )
  values (
    p_app,
    p_severity,
    p_code,
    left(p_message, 1000),
    coalesce(p_context, '{}'::jsonb),
    p_tenant_id,
    p_branch_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.log_app_error(text, text, text, text, jsonb, uuid, uuid)
  to authenticated, anon;
