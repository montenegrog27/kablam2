-- Ingredients a customer is allowed to remove from each product inside a combo.

create table if not exists public.combo_removable_ingredients (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.combos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(combo_id, product_id, ingredient_id)
);

create index if not exists combo_removable_ingredients_combo_idx
  on public.combo_removable_ingredients(combo_id)
  where is_active = true;

alter table public.combo_removable_ingredients enable row level security;

drop policy if exists "combo_removable_ingredients_public_select"
  on public.combo_removable_ingredients;

create policy "combo_removable_ingredients_public_select"
  on public.combo_removable_ingredients for select
  using (is_active = true);

drop policy if exists "combo_removable_ingredients_tenant_manage"
  on public.combo_removable_ingredients;

create policy "combo_removable_ingredients_tenant_manage"
  on public.combo_removable_ingredients for all
  using (
    exists (
      select 1
      from public.combos c
      where c.id = combo_removable_ingredients.combo_id
        and c.tenant_id = (select tenant_id from public.users where id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.combos c
      where c.id = combo_removable_ingredients.combo_id
        and c.tenant_id = (select tenant_id from public.users where id = auth.uid())
    )
  );
