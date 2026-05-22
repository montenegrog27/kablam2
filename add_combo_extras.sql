-- Extras selectable for combos in customer.

create table if not exists public.combo_extras (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.combos(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(combo_id, ingredient_id)
);

create index if not exists combo_extras_combo_idx
  on public.combo_extras(combo_id)
  where is_active = true;

alter table public.combo_extras enable row level security;

create policy "combo_extras_public_select"
  on public.combo_extras for select
  using (is_active = true);

create policy "combo_extras_tenant_manage"
  on public.combo_extras for all
  using (
    exists (
      select 1
      from public.combos c
      where c.id = combo_extras.combo_id
        and c.tenant_id = (select tenant_id from public.users where id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.combos c
      where c.id = combo_extras.combo_id
        and c.tenant_id = (select tenant_id from public.users where id = auth.uid())
    )
  );
