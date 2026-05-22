-- Reservations module: branch-level landing config + customer submissions.

create table if not exists public.reservation_settings (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  title text,
  description text,
  hero_image_url text,
  location_name text,
  location_address text,
  event_date date,
  start_time time,
  end_time time,
  slot_interval_minutes integer not null default 30,
  min_party_size integer not null default 1,
  max_party_size integer not null default 20,
  capacity_per_slot integer,
  deposit_amount numeric(12,2),
  deposit_alias text,
  confirmation_title text,
  confirmation_message text,
  whatsapp_message_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  party_size integer not null,
  reservation_date date not null,
  reservation_time time not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  source text not null default 'customer',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  enabled boolean not null default true,
  title text not null default 'Reservas',
  description text,
  hero_image_url text,
  location_name text,
  location_address text,
  event_date date not null,
  start_time time not null default '12:00',
  end_time time not null default '15:00',
  slot_interval_minutes integer not null default 30,
  min_party_size integer not null default 1,
  max_party_size integer not null default 20,
  capacity_per_slot integer,
  deposit_amount numeric(12,2),
  deposit_alias text,
  confirmation_title text,
  confirmation_message text,
  whatsapp_message_template text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservations
  add column if not exists reservation_event_id uuid references public.reservation_events(id) on delete set null;

create index if not exists reservations_branch_date_idx
  on public.reservations(branch_id, reservation_date, reservation_time);

create index if not exists reservations_tenant_created_idx
  on public.reservations(tenant_id, created_at desc);

create index if not exists reservation_events_branch_date_idx
  on public.reservation_events(branch_id, event_date, start_time);

create index if not exists reservations_event_idx
  on public.reservations(reservation_event_id);

alter table public.reservation_settings enable row level security;
alter table public.reservation_events enable row level security;
alter table public.reservations enable row level security;

create policy "reservation_settings_public_select"
  on public.reservation_settings for select
  using (enabled = true);

create policy "reservation_settings_tenant_manage"
  on public.reservation_settings for all
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create policy "reservation_events_public_select"
  on public.reservation_events for select
  using (enabled = true);

create policy "reservation_events_tenant_manage"
  on public.reservation_events for all
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create policy "reservations_tenant_select"
  on public.reservations for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create policy "reservations_tenant_update"
  on public.reservations for update
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

insert into public.permissions (key, name, module, description)
values ('admin.reservations.view', 'Ver Reservas', 'admin', 'Configurar y gestionar reservas')
on conflict (key) do nothing;
