import { supabase } from "@kablam/supabase";

export async function loadMenu(branchSlug: string) {

  console.log("🔎 loadMenu branchSlug:", branchSlug);

  const { data: branch } = await supabase
    .from("branches")
    .select("*")
    .ilike("slug", branchSlug)
    .limit(1)
    .single();

  if (!branch) return [];

  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      branch_id,
      categories(
        id,
        name
      ),
      product_variants(
        id,
        name,
        price,
        image_url,
        is_default,
        description
      ),
      modifier_group_products(
        modifier_groups(
          modifiers(
            id,
            name,
            price
          )
        )
      )
    `)
    .eq("branch_id", branch.id)
    .eq("is_active", true);

  if (error) {
    console.error("🔥 products error:", error);
    return [];
  }

  /* NORMALIZAR DATA PARA EL FRONT */

  const menu = (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    branch_id: p.branch_id,

    categories: p.categories
      ? [{ id: p.categories.id, name: p.categories.name }]
      : [],

    product_variants: p.product_variants || [],

    modifier_group_products: p.modifier_group_products || [],
  }));

  console.log("🔥 MENU NORMALIZED:", menu);

  return menu;
}