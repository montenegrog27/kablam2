-- Central cost source: ingredients + packaging per product variant.
-- Run this in Supabase SQL editor.

create or replace view public.variant_costs
with (security_invoker = true)
as
with ingredient_costs as (
  select
    pr.variant_id,
    coalesce(sum(coalesce(pr.quantity, 0) * coalesce(i.cost_per_unit, 0)), 0) as ingredient_cost
  from public.product_recipes pr
  left join public.ingredients i on i.id = pr.ingredient_id
  group by pr.variant_id
),
packaging_costs as (
  select
    pp.variant_id,
    coalesce(sum(coalesce(pp.quantity, 0) * coalesce(p.cost_per_unit, 0)), 0) as packaging_cost
  from public.product_packaging pp
  left join public.packaging p on p.id = pp.packaging_id
  group by pp.variant_id
),
select
  pv.id as variant_id,
  pv.product_id,
  coalesce(ic.ingredient_cost, 0) as ingredient_cost,
  coalesce(pc.packaging_cost, 0) as packaging_cost,
  coalesce(ic.ingredient_cost, 0) + coalesce(pc.packaging_cost, 0) as total_cost
from public.product_variants pv
left join ingredient_costs ic on ic.variant_id = pv.id
left join packaging_costs pc on pc.variant_id = pv.id;

grant select on public.variant_costs to anon, authenticated, service_role;
