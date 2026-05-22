-- Multitenant domain resolver.
-- Custom domains are resolved by exact normalized host, while platform
-- subdomains continue to work as tenant_slug.kablam.com.

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint tenant_domains_domain_unique unique (domain),
  constraint tenant_domains_domain_lowercase check (domain = lower(domain)),
  constraint tenant_domains_domain_no_protocol check (
    domain not like 'http://%' and domain not like 'https://%' and domain not like '%/%'
  )
);

create index if not exists tenant_domains_tenant_idx
  on public.tenant_domains(tenant_id);

alter table public.tenant_domains enable row level security;

create policy "tenant_domains_public_select"
  on public.tenant_domains for select
  using (is_active = true);

create policy "tenant_domains_tenant_select"
  on public.tenant_domains for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create policy "tenant_domains_tenant_write"
  on public.tenant_domains for all
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- Examples:
-- insert into public.tenant_domains (tenant_id, domain, is_primary)
-- select id, 'polemico.com.ar', true from public.tenants where slug = 'polemico'
-- on conflict (domain) do nothing;
--
-- insert into public.tenant_domains (tenant_id, domain)
-- select id, 'www.polemico.com.ar' from public.tenants where slug = 'polemico'
-- on conflict (domain) do nothing;
