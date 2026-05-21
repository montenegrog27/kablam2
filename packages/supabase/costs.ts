type SupabaseLike = {
  from: (table: string) => any;
};

function uniqueIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function getVariantCostMap(
  supabase: SupabaseLike,
  variantIds: Array<string | null | undefined>,
) {
  const ids = uniqueIds(variantIds);
  const costs: Record<string, number> = {};

  if (ids.length === 0) return costs;

  const { data: viewCosts, error: viewError } = await supabase
    .from("variant_costs")
    .select("variant_id,total_cost")
    .in("variant_id", ids);

  if (!viewError && viewCosts) {
    viewCosts.forEach((row: any) => {
      costs[row.variant_id] = Number(row.total_cost || 0);
    });
    return costs;
  }

  const [{ data: recipes }, { data: packaging }] = await Promise.all([
    supabase
      .from("product_recipes")
      .select("variant_id,quantity,ingredients(cost_per_unit)")
      .in("variant_id", ids),
    supabase
      .from("product_packaging")
      .select("variant_id,quantity,packaging(cost_per_unit)")
      .in("variant_id", ids),
  ]);

  recipes?.forEach((row: any) => {
    costs[row.variant_id] =
      (costs[row.variant_id] || 0) +
      Number(row.quantity || 0) * Number(row.ingredients?.cost_per_unit || 0);
  });

  packaging?.forEach((row: any) => {
    costs[row.variant_id] =
      (costs[row.variant_id] || 0) +
      Number(row.quantity || 0) * Number(row.packaging?.cost_per_unit || 0);
  });

  return costs;
}

export function getDefaultVariant(product: any) {
  const variants = product?.product_variants || [];
  return variants.find((variant: any) => variant.is_default) || variants[0] || null;
}
