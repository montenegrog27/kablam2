alter table public.reservation_events
  add column if not exists require_customer_name boolean not null default true,
  add column if not exists show_customer_phone boolean not null default true,
  add column if not exists require_customer_phone boolean not null default true,
  add column if not exists show_customer_email boolean not null default true,
  add column if not exists require_customer_email boolean not null default false,
  add column if not exists show_customer_notes boolean not null default true,
  add column if not exists require_customer_notes boolean not null default false;
