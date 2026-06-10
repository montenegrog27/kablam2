create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  email text,
  access_code text not null,
  salary numeric(12, 2) not null default 0,
  salary_frequency text not null default 'MONTHLY',
  role_id uuid references public.roles(id) on delete set null,
  role text not null default 'employee',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, access_code)
);

alter table public.employees
drop constraint if exists employees_salary_frequency_check;

alter table public.employees
add constraint employees_salary_frequency_check
check (salary_frequency in ('HOURLY', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'));

alter table public.employees
add column if not exists role_id uuid references public.roles(id) on delete set null;

create table if not exists public.employee_attendances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  source text not null default 'staff_app',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_tenant_branch_idx
on public.employees(tenant_id, branch_id);

create index if not exists employee_attendances_tenant_week_idx
on public.employee_attendances(tenant_id, clock_in_at desc);

alter table public.employees enable row level security;
alter table public.employee_attendances enable row level security;

drop policy if exists "employees_tenant_select" on public.employees;
create policy "employees_tenant_select"
on public.employees for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "employees_owner_admin_all" on public.employees;
create policy "employees_owner_admin_all"
on public.employees for all
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
)
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

drop policy if exists "employee_attendances_tenant_select" on public.employee_attendances;
create policy "employee_attendances_tenant_select"
on public.employee_attendances for select
using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists "employee_attendances_owner_admin_all" on public.employee_attendances;
create policy "employee_attendances_owner_admin_all"
on public.employee_attendances for all
using (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
)
with check (
  tenant_id = (select tenant_id from public.users where id = auth.uid())
  and (select role from public.users where id = auth.uid()) in ('owner', 'admin')
);

insert into public.permissions (module, key, name, description)
values
  ('admin', 'admin.employees.view', 'Ver empleados', 'Permite ver empleados y asistencias.'),
  ('admin', 'admin.employees.manage', 'Gestionar empleados', 'Permite crear empleados, editar sueldos y roles.')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    module = excluded.module;
