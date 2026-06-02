-- Customer app root hub (/): configurable Linktree-style landing.

create extension if not exists pgcrypto;

create table if not exists public.customer_hub_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  logo_url text,
  title text,
  subtitle text,
  font_family text,
  font_url text,
  background_color text default '#f8fafc',
  text_color text default '#111827',
  accent_color text default '#111827',
  show_branch_order_links boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.customer_hub_settings
  add column if not exists font_family text,
  add column if not exists font_url text;

create table if not exists public.customer_hub_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  url text not null,
  icon text not null default 'link',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.customer_hub_links
  alter column id set default gen_random_uuid();

create index if not exists customer_hub_links_tenant_sort_idx
  on public.customer_hub_links(tenant_id, sort_order);

alter table public.customer_hub_settings enable row level security;
alter table public.customer_hub_links enable row level security;

drop policy if exists "customer_hub_settings_public_select" on public.customer_hub_settings;
create policy "customer_hub_settings_public_select"
  on public.customer_hub_settings for select
  using (true);

drop policy if exists "customer_hub_links_public_select" on public.customer_hub_links;
create policy "customer_hub_links_public_select"
  on public.customer_hub_links for select
  using (is_active = true);

drop policy if exists "customer_hub_settings_tenant_write" on public.customer_hub_settings;
create policy "customer_hub_settings_tenant_write"
  on public.customer_hub_settings for all
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "customer_hub_links_tenant_write" on public.customer_hub_links;
create policy "customer_hub_links_tenant_write"
  on public.customer_hub_links for all
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

insert into public.permissions (key, name, module, description)
values ('admin.customerhub.view', 'Ver Hub Cliente', 'admin', 'Configurar el hub de links de la app customer')
on conflict (key) do nothing;
