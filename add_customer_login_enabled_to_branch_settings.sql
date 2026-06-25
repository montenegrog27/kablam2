alter table public.branch_settings
  add column if not exists customer_login_enabled boolean not null default true;

