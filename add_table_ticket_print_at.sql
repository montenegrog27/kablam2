-- Enables waiter/staff flow to request a customer ticket when a table moves to paying.
-- Run in Supabase SQL editor.

alter table public.orders
  add column if not exists comanda_print_at timestamptz,
  add column if not exists ticket_print_at timestamptz;

create index if not exists idx_orders_ticket_print_at
  on public.orders (branch_id, ticket_print_at desc)
  where ticket_print_at is not null;

create index if not exists idx_orders_comanda_print_at
  on public.orders (branch_id, comanda_print_at desc)
  where comanda_print_at is not null;
