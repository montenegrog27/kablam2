-- Waiter/table service enhancements.
-- Run in Supabase SQL editor after add_tables_system.sql.

alter table public.table_sessions
  add column if not exists opened_by uuid references public.employees(id) on delete set null,
  add column if not exists closed_by uuid references public.employees(id) on delete set null,
  add column if not exists paid_by uuid references public.employees(id) on delete set null,
  add column if not exists last_order_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null,
  add column if not exists payment_ref text,
  add column if not exists notes text;

alter table public.order_items
  add column if not exists notes text;

create index if not exists table_sessions_branch_status_idx
on public.table_sessions(status, opened_at desc);

create index if not exists table_sessions_open_table_idx
on public.table_sessions(table_id, status)
where status in ('open', 'paying');
