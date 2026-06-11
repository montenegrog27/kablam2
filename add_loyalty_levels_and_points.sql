-- Fidelizacion avanzada: niveles, reglas de puntos y procesamiento idempotente por orden.
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.loyalty_rules drop constraint if exists loyalty_rules_type_check;

alter table public.loyalty_rules
  add column if not exists applies_to text not null default 'order',
  add column if not exists combo_id uuid null references public.combos(id) on delete cascade,
  add column if not exists points_per_unit integer not null default 0,
  add column if not exists points_per_extra_peso numeric not null default 0,
  add column if not exists minimum_amount numeric not null default 0,
  add column if not exists priority integer not null default 100;

alter table public.loyalty_rules
  add constraint loyalty_rules_type_check
  check (type in (
    'points',
    'product_accumulation',
    'product_points',
    'combo_points',
    'category_points',
    'extra_points'
  ));

alter table public.loyalty_rules drop constraint if exists loyalty_rules_applies_to_check;
alter table public.loyalty_rules
  add constraint loyalty_rules_applies_to_check
  check (applies_to in ('order', 'product', 'combo', 'category', 'extra'));

create table if not exists public.loyalty_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  description text,
  min_points integer not null default 0,
  max_points integer,
  sort_order integer not null default 0,
  color text not null default '#FF1A1A',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_loyalty_levels_tenant_name
  on public.loyalty_levels (tenant_id, lower(name));

create index if not exists idx_loyalty_levels_tenant_points
  on public.loyalty_levels (tenant_id, min_points);

create table if not exists public.loyalty_point_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  rule_id uuid references public.loyalty_rules(id) on delete set null,
  source text not null,
  points integer not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_loyalty_point_events_order_rule_source
  on public.loyalty_point_events (order_id, rule_id, source)
  where order_id is not null and rule_id is not null;

alter table public.orders
  add column if not exists loyalty_points_awarded integer not null default 0,
  add column if not exists loyalty_processed_at timestamptz;

alter table public.customers add column if not exists loyalty_points integer default 0;
alter table public.customers add column if not exists total_points_earned integer default 0;
alter table public.customers add column if not exists lifetime_orders integer default 0;
alter table public.customers add column if not exists lifetime_spent numeric default 0;
alter table public.customers add column if not exists last_order_at timestamptz;

create or replace function public.seed_default_loyalty_levels(p_tenant_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.loyalty_levels (tenant_id, name, description, min_points, max_points, sort_order, color)
  select p_tenant_id, seed.name, seed.description, seed.min_points, seed.max_points, seed.sort_order, seed.color
  from (
    values
      ('Mordisco', 'Primer nivel del club.', 0, 999, 10, '#FF1A1A'),
      ('Doble Mordisco', 'Clientes que ya volvieron por mas.', 1000, 2999, 20, '#FF1A1A'),
      ('Mordisco XL', 'Clientes frecuentes con alto consumo.', 3000, 6999, 30, '#FF1A1A'),
      ('Leyenda Mordisco', 'La elite del club.', 7000, null, 40, '#FF1A1A')
  ) as seed(name, description, min_points, max_points, sort_order, color)
  where not exists (
    select 1
    from public.loyalty_levels existing
    where existing.tenant_id = p_tenant_id
      and lower(existing.name) = lower(seed.name)
  );

  update public.loyalty_levels
  set updated_at = now()
  where tenant_id = p_tenant_id;
end;
$$;

create or replace function public.process_loyalty_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order record;
  v_rule record;
  v_points integer;
  v_total_points integer := 0;
  v_extra_count integer;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found or v_order.customer_id is null then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  if v_order.loyalty_processed_at is not null then
    return jsonb_build_object('ok', true, 'alreadyProcessed', true, 'points', coalesce(v_order.loyalty_points_awarded, 0));
  end if;

  perform public.seed_default_loyalty_levels(v_order.tenant_id);

  for v_rule in
    select *
    from public.loyalty_rules
    where tenant_id = v_order.tenant_id
      and is_active = true
      and (
        starts_at is null or starts_at <= coalesce(v_order.created_at, now())
      )
      and (
        expires_at is null or expires_at >= coalesce(v_order.created_at, now())
      )
    order by priority asc, created_at asc
  loop
    v_points := 0;

    if v_rule.type = 'points' and coalesce(v_order.subtotal, v_order.total, 0) >= coalesce(v_rule.minimum_amount, 0) then
      v_points := floor(coalesce(v_order.subtotal, v_order.total, 0) / greatest(coalesce(v_rule.points_per_amount, 1000), 1));

    elsif v_rule.type = 'product_points' then
      select coalesce(sum(oi.quantity), 0)::integer * greatest(coalesce(v_rule.points_per_unit, 0), 0)
      into v_points
      from public.order_items oi
      where oi.order_id = p_order_id
        and oi.product_id is not null
        and (v_rule.product_id is null or oi.product_id = v_rule.product_id);

    elsif v_rule.type = 'combo_points' then
      select coalesce(sum(oi.quantity), 0)::integer * greatest(coalesce(v_rule.points_per_unit, 0), 0)
      into v_points
      from public.order_items oi
      where oi.order_id = p_order_id
        and oi.combo_id is not null
        and (v_rule.combo_id is null or oi.combo_id = v_rule.combo_id);

    elsif v_rule.type = 'category_points' then
      select coalesce(sum(units), 0)::integer * greatest(coalesce(v_rule.points_per_unit, 0), 0)
      into v_points
      from (
        select oi.quantity as units
        from public.order_items oi
        join public.products p on p.id = oi.product_id
        where oi.order_id = p_order_id
          and v_rule.category_id is not null
          and p.category_id = v_rule.category_id

        union all

        select oi.quantity * coalesce(cp.quantity, 1) as units
        from public.order_items oi
        join public.combo_products cp on cp.combo_id = oi.combo_id
        join public.products p on p.id = cp.product_id
        where oi.order_id = p_order_id
          and oi.combo_id is not null
          and v_rule.category_id is not null
          and p.category_id = v_rule.category_id
      ) category_units;

    elsif v_rule.type = 'extra_points' then
      select coalesce(sum(oi.quantity), 0)::integer
      into v_extra_count
      from public.order_items oi
      cross join lateral jsonb_array_elements(coalesce(oi.extras, '[]'::jsonb)) extra
      where oi.order_id = p_order_id
        and extra->>'type' = 'extra';

      v_points := coalesce(v_extra_count, 0) * greatest(coalesce(v_rule.points_per_unit, 0), 0);
    end if;

    if coalesce(v_points, 0) > 0 then
      insert into public.loyalty_point_events (
        tenant_id,
        branch_id,
        customer_id,
        order_id,
        rule_id,
        source,
        points,
        description,
        metadata
      )
      values (
        v_order.tenant_id,
        v_order.branch_id,
        v_order.customer_id,
        p_order_id,
        v_rule.id,
        v_rule.type,
        v_points,
        v_rule.name,
        jsonb_build_object('ruleName', v_rule.name, 'orderSubtotal', v_order.subtotal, 'orderTotal', v_order.total)
      )
      on conflict do nothing;

      v_total_points := v_total_points + v_points;
    end if;
  end loop;

  if v_total_points > 0 then
    update public.customers
    set
      loyalty_points = coalesce(loyalty_points, 0) + v_total_points,
      total_points_earned = coalesce(total_points_earned, 0) + v_total_points,
      lifetime_orders = coalesce(lifetime_orders, 0) + 1,
      lifetime_spent = coalesce(lifetime_spent, 0) + coalesce(v_order.total, 0),
      last_order_at = coalesce(v_order.created_at, now())
    where id = v_order.customer_id;
  else
    update public.customers
    set
      lifetime_orders = coalesce(lifetime_orders, 0) + 1,
      lifetime_spent = coalesce(lifetime_spent, 0) + coalesce(v_order.total, 0),
      last_order_at = coalesce(v_order.created_at, now())
    where id = v_order.customer_id;
  end if;

  update public.orders
  set loyalty_points_awarded = v_total_points,
      loyalty_processed_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'points', v_total_points);
end;
$$;

grant execute on function public.seed_default_loyalty_levels(uuid) to authenticated, service_role;
grant execute on function public.process_loyalty_for_order(uuid) to authenticated, service_role;

alter table public.loyalty_levels enable row level security;
alter table public.loyalty_point_events enable row level security;
alter table public.loyalty_rules enable row level security;

drop policy if exists loyalty_levels_tenant_select on public.loyalty_levels;
create policy loyalty_levels_tenant_select on public.loyalty_levels
for select using (true);

drop policy if exists loyalty_levels_service_all on public.loyalty_levels;
create policy loyalty_levels_service_all on public.loyalty_levels
for all using (true) with check (true);

drop policy if exists loyalty_point_events_service_all on public.loyalty_point_events;
create policy loyalty_point_events_service_all on public.loyalty_point_events
for all using (true) with check (true);

drop policy if exists loyalty_rules_tenant_select on public.loyalty_rules;
create policy loyalty_rules_tenant_select on public.loyalty_rules
for select using (true);

drop policy if exists loyalty_rules_service_all on public.loyalty_rules;
create policy loyalty_rules_service_all on public.loyalty_rules
for all using (true) with check (true);
