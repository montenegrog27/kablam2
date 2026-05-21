-- Read-only RLS/security audit helpers.
-- Run these in Supabase SQL editor to inspect current policy coverage.

select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'orders',
    'order_items',
    'order_payments',
    'cash_sessions',
    'cash_closures',
    'cash_movements',
    'customers',
    'messages',
    'users',
    'payment_methods',
    'audit_logs',
    'app_error_logs'
  )
order by tablename;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'orders',
    'order_items',
    'order_payments',
    'cash_sessions',
    'cash_closures',
    'cash_movements',
    'customers',
    'messages',
    'users',
    'payment_methods',
    'audit_logs',
    'app_error_logs'
  )
order by tablename, policyname;
