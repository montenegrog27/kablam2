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
  }

  const [{ data: recipes }, { data: packaging }, { data: variants }] = await Promise.all([
    supabase
      .from("product_recipes")
      .select("variant_id,quantity,ingredients(cost_per_unit)")
      .in("variant_id", ids),
    supabase
      .from("product_packaging")
      .select("variant_id,quantity,packaging(cost_per_unit)")
      .in("variant_id", ids),
    supabase
      .from("product_variants")
      .select("id,cost")
      .in("id", ids),
  ]);

  const calculatedCosts: Record<string, number> = {};

  recipes?.forEach((row: any) => {
    calculatedCosts[row.variant_id] =
      (calculatedCosts[row.variant_id] || 0) +
      Number(row.quantity || 0) * Number(row.ingredients?.cost_per_unit || 0);
  });

  packaging?.forEach((row: any) => {
    calculatedCosts[row.variant_id] =
      (calculatedCosts[row.variant_id] || 0) +
      Number(row.quantity || 0) * Number(row.packaging?.cost_per_unit || 0);
  });

  Object.entries(calculatedCosts).forEach(([variantId, cost]) => {
    if (cost > 0) costs[variantId] = cost;
  });

  variants?.forEach((variant: any) => {
    const manualCost = Number(variant.cost || 0);
    if (!costs[variant.id] && manualCost > 0) {
      costs[variant.id] = manualCost;
    }
  });

  return costs;
}

export function getDefaultVariant(product: any) {
  const variants = product?.product_variants || [];
  return variants.find((variant: any) => variant.is_default) || variants[0] || null;
}

export async function getProductCostMap(
  supabase: SupabaseLike,
  productIds: Array<string | null | undefined>,
) {
  const ids = uniqueIds(productIds);
  const costs: Record<string, number> = {};

  if (ids.length === 0) return costs;

  const { data: variants } = await supabase
    .from("product_variants")
    .select("id,product_id,is_default,cost")
    .in("product_id", ids)
    .order("is_default", { ascending: false });

  const defaultVariantByProduct: Record<string, string> = {};
  (variants || []).forEach((variant: any) => {
    if (!defaultVariantByProduct[variant.product_id]) {
      defaultVariantByProduct[variant.product_id] = variant.id;
    }
  });

  const variantCosts = await getVariantCostMap(supabase, Object.values(defaultVariantByProduct));

  Object.entries(defaultVariantByProduct).forEach(([productId, variantId]) => {
    costs[productId] = Number(variantCosts[variantId] || 0);
  });

  return costs;
}

export async function getComboCostMap(
  supabase: SupabaseLike,
  comboIds: Array<string | null | undefined>,
) {
  const ids = uniqueIds(comboIds);
  const costs: Record<string, number> = {};

  if (ids.length === 0) return costs;

  const { data: combos } = await supabase
    .from("combos")
    .select("id, combo_products!left(product_id, quantity)")
    .in("id", ids);

  const productIds = [
    ...new Set((combos || []).flatMap((combo: any) =>
      (combo.combo_products || []).map((item: any) => item.product_id),
    ).filter((id: unknown): id is string => typeof id === "string" && id.length > 0)),
  ] as string[];
  const productCosts = await getProductCostMap(supabase, productIds);

  (combos || []).forEach((combo: any) => {
    costs[combo.id] = (combo.combo_products || []).reduce(
      (sum: number, item: any) =>
        sum + Number(productCosts[item.product_id] || 0) * Number(item.quantity || 1),
      0,
    );
  });

  return costs;
}
