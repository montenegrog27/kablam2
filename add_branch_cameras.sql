-- Camera links per branch and attendance snapshots.
-- Run this in Supabase SQL editor before using /cameras in admin.

create extension if not exists pgcrypto;

create table if not exists public.branch_cameras (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  snapshot_url text not null,
  location text,
  active boolean not null default true,
  sort_order integer not null default 0,
  last_snapshot_at timestamptz,
  last_snapshot_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_attendance_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_id uuid not null references public.employee_attendances(id) on delete cascade,
  camera_id uuid references public.branch_cameras(id) on delete set null,
  camera_name text,
  image_url text,
  status text not null default 'captured' check (status in ('captured', 'failed')),
  error text,
  captured_at timestamptz not null default now()
);

create index if not exists branch_cameras_tenant_branch_idx
  on public.branch_cameras (tenant_id, branch_id, active, sort_order);

create index if not exists employee_attendance_snapshots_attendance_idx
  on public.employee_attendance_snapshots (attendance_id, captured_at desc);

create index if not exists employee_attendance_snapshots_tenant_branch_idx
  on public.employee_attendance_snapshots (tenant_id, branch_id, captured_at desc);

alter table public.branch_cameras enable row level security;
alter table public.employee_attendance_snapshots enable row level security;

drop policy if exists branch_cameras_tenant_select on public.branch_cameras;
create policy branch_cameras_tenant_select
on public.branch_cameras for select
using (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
);

drop policy if exists branch_cameras_tenant_insert on public.branch_cameras;
create policy branch_cameras_tenant_insert
on public.branch_cameras for insert
with check (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
);

drop policy if exists branch_cameras_tenant_update on public.branch_cameras;
create policy branch_cameras_tenant_update
on public.branch_cameras for update
using (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
)
with check (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
);

drop policy if exists branch_cameras_tenant_delete on public.branch_cameras;
create policy branch_cameras_tenant_delete
on public.branch_cameras for delete
using (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
);

drop policy if exists attendance_snapshots_tenant_select on public.employee_attendance_snapshots;
create policy attendance_snapshots_tenant_select
on public.employee_attendance_snapshots for select
using (
  tenant_id = (
    select users.tenant_id
    from public.users
    where users.id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-snapshots',
  'attendance-snapshots',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
