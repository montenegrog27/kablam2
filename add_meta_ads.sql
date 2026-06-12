-- ==========================================
-- META ADS CENTER - Multi-tenant
-- Run this in Supabase SQL editor.
-- ==========================================

create table if not exists public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  name text not null,
  currency text,
  timezone_name text,
  business_name text,
  status text not null default 'active',
  is_primary boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, provider_account_id)
);

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ad_account_id uuid references public.ad_accounts(id) on delete cascade,
  provider text not null,
  provider_campaign_id text not null,
  name text not null,
  objective text,
  status text,
  effective_status text,
  buying_type text,
  daily_budget numeric(14, 2),
  lifetime_budget numeric(14, 2),
  start_time timestamptz,
  stop_time timestamptz,
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, provider_campaign_id)
);

create table if not exists public.ad_insights_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ad_account_id uuid references public.ad_accounts(id) on delete cascade,
  ad_campaign_id uuid references public.ad_campaigns(id) on delete cascade,
  provider text not null,
  provider_campaign_id text not null,
  date date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks bigint not null default 0,
  ctr numeric(10, 4) not null default 0,
  cpc numeric(14, 4) not null default 0,
  cpm numeric(14, 4) not null default 0,
  purchases numeric(14, 2) not null default 0,
  purchase_value numeric(14, 2) not null default 0,
  leads numeric(14, 2) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, provider_campaign_id, date)
);

create table if not exists public.ad_audiences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  provider_audience_id text,
  name text not null,
  subtype text,
  size_lower_bound integer,
  size_upper_bound integer,
  delivery_status text,
  operation_status text,
  source text,
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, provider_audience_id)
);

create table if not exists public.ad_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  status text not null default 'running',
  sync_type text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  accounts_count integer not null default 0,
  campaigns_count integer not null default 0,
  insights_count integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.meta_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text not null default '/ads',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ad_accounts_tenant_provider_idx
on public.ad_accounts(tenant_id, provider);

create index if not exists ad_campaigns_tenant_provider_status_idx
on public.ad_campaigns(tenant_id, provider, effective_status);

create index if not exists ad_insights_daily_tenant_date_idx
on public.ad_insights_daily(tenant_id, provider, date desc);

create index if not exists ad_sync_runs_tenant_started_idx
on public.ad_sync_runs(tenant_id, provider, started_at desc);

alter table public.ad_accounts enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_insights_daily enable row level security;
alter table public.ad_audiences enable row level security;
alter table public.ad_sync_runs enable row level security;
alter table public.meta_oauth_states enable row level security;

drop policy if exists "ad_accounts_tenant_select" on public.ad_accounts;
create policy "ad_accounts_tenant_select"
on public.ad_accounts for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "ad_campaigns_tenant_select" on public.ad_campaigns;
create policy "ad_campaigns_tenant_select"
on public.ad_campaigns for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "ad_insights_daily_tenant_select" on public.ad_insights_daily;
create policy "ad_insights_daily_tenant_select"
on public.ad_insights_daily for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "ad_audiences_tenant_select" on public.ad_audiences;
create policy "ad_audiences_tenant_select"
on public.ad_audiences for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "ad_sync_runs_tenant_select" on public.ad_sync_runs;
create policy "ad_sync_runs_tenant_select"
on public.ad_sync_runs for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "meta_oauth_states_owner_admin_select" on public.meta_oauth_states;
create policy "meta_oauth_states_owner_admin_select"
on public.meta_oauth_states for select
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

insert into public.permissions (module, key, name, description)
values
  ('admin', 'admin.ads.view', 'Ver Ads Center', 'Permite ver cuentas, campanas, metricas y reportes de Ads.'),
  ('admin', 'admin.ads.manage', 'Gestionar Ads Center', 'Permite conectar Meta Ads, sincronizar datos y preparar campanas.')
on conflict (key) do update
set module = excluded.module,
    name = excluded.name,
    description = excluded.description;
