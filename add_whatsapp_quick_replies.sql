create extension if not exists pgcrypto;

create table if not exists public.whatsapp_quick_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  short_name text not null,
  message text not null,
  icon text,
  position integer not null default 0,
  show_in_whatsapp_tab boolean not null default true,
  show_in_order_sidebar boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_quick_replies_tenant_idx
  on public.whatsapp_quick_replies(tenant_id, branch_id, is_active, position);

alter table public.whatsapp_quick_replies enable row level security;

drop policy if exists "whatsapp_quick_replies_select" on public.whatsapp_quick_replies;
create policy "whatsapp_quick_replies_select"
  on public.whatsapp_quick_replies
  for select
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.tenant_id = whatsapp_quick_replies.tenant_id
    )
  );

drop policy if exists "whatsapp_quick_replies_insert" on public.whatsapp_quick_replies;
create policy "whatsapp_quick_replies_insert"
  on public.whatsapp_quick_replies
  for insert
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.tenant_id = whatsapp_quick_replies.tenant_id
        and u.role in ('owner', 'manager', 'admin')
    )
  );

drop policy if exists "whatsapp_quick_replies_update" on public.whatsapp_quick_replies;
create policy "whatsapp_quick_replies_update"
  on public.whatsapp_quick_replies
  for update
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.tenant_id = whatsapp_quick_replies.tenant_id
        and u.role in ('owner', 'manager', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.tenant_id = whatsapp_quick_replies.tenant_id
        and u.role in ('owner', 'manager', 'admin')
    )
  );

drop policy if exists "whatsapp_quick_replies_delete" on public.whatsapp_quick_replies;
create policy "whatsapp_quick_replies_delete"
  on public.whatsapp_quick_replies
  for delete
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.tenant_id = whatsapp_quick_replies.tenant_id
        and u.role in ('owner', 'manager', 'admin')
    )
  );
