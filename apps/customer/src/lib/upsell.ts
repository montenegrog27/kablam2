import { supabaseBrowser } from "@kablam/supabase/client";
import type { Product, Category } from "../types/menu";
import type { ProductRow } from "./loadMenu";

type ProductVariant = ProductRow["product_variants"][0];
type ProductIngredientDisplay = ProductRow["product_ingredients_display"][0];
type ProductExtra = ProductRow["product_extras"][0];

export type UpsellRule = {
  id: string;
  tenant_id: string;
  category_id: string;
  suggested_category_id: string;
  suggested_product_ids?: string[] | null;
  discount: number;
  is_active: boolean;
  display_order: number;
  category?: { name: string };
  suggested_category?: { name: string };
};

/**
 * Obtiene reglas de upsell activas para un tenant específico
 */
export async function getUpsellRules(tenantId: string): Promise<UpsellRule[]> {
  console.log("UPSELL: Fetching rules for tenant:", tenantId);

  const { data, error } = await supabaseBrowser
    .from("upsell_rules")
    .select(
      `
      id,
      tenant_id,
      category_id,
      suggested_category_id,
      suggested_product_ids,
      discount,
      is_active,
      display_order,
      category:categories!upsell_rules_category_id_fkey(name),
      suggested_category:categories!upsell_rules_suggested_category_id_fkey(name)
    `,
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    console.error("Error fetching upsell rules:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  console.log("UPSELL: Rules found:", data?.length || 0);

  // Transform category/suggested_category from possible arrays to single objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rules = (data || []).map((rule: any) => ({
    ...rule,
    category: Array.isArray(rule.category) ? rule.category[0] : rule.category,
    suggested_category: Array.isArray(rule.suggested_category)
      ? rule.suggested_category[0]
      : rule.suggested_category,
  }));

  return rules as UpsellRule[];
}

/**
 * Obtiene productos sugeribles (is_suggestable = true) para una sucursal específica
 * Opcionalmente filtrar por categoría
 */
export async function getSuggestableProducts(
  branchId: string,
  categoryIds?: string[],
): Promise<Product[]> {
  console.log(
    "UPSELL: Fetching suggestable products for branch:",
    branchId,
    "categories:",
    categoryIds,
  );
  let query = supabaseBrowser
    .from("products")
    .select(
      `
       id,
       name,
       description,
       branch_id,
       category_id,
       allow_half,
       is_hero,
       is_featured,
       is_suggestable,
       show_in_menu,
      categories(
        id,
        name,
        parent_id
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
          id,
          name,
          modifiers(
            id,
            name,
            price
          )
        )
      ),
      product_ingredients_display(
        id,
        ingredient_id,
        is_essential,
        is_visible,
        ingredients(
          id,
          name,
          sale_price,
          cost_per_unit
        )
      ),
      product_extras(
        id,
        ingredient_id,
        is_active,
        ingredients(
          id,
          name,
          sale_price,
          cost_per_unit
        )
      )
    `,
    )
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .or("is_suggestable.eq.true,show_in_menu.eq.false");

  // Filtrar por categorías si se especifican
  if (categoryIds && categoryIds.length > 0) {
    query = query.in("category_id", categoryIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching suggestable products:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  console.log("UPSELL: Suggestable products query result:", {
    count: data?.length || 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawData: data?.slice(0, 5).map((p: any) => ({
      id: p.id,
      name: p.name,
      category_id: p.category_id,
      is_suggestable: p.is_suggestable,
      show_in_menu: p.show_in_menu,
    })), // Mostrar primeros 5 para debugging
    categoryIdsFilter: categoryIds,
  });

  // Transformar datos al tipo Product (similar a loadMenu)
  const products: Product[] = (data as unknown as ProductRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || undefined,
    allow_half: p.allow_half || false,
    is_hero: p.is_hero || false,
    is_featured: p.is_featured || false,
    is_suggestable: p.is_suggestable || false,
    show_in_menu: p.show_in_menu !== undefined ? p.show_in_menu : true,
    categories: (() => {
      const cat = p.categories;
      if (!cat) return [];
      if (Array.isArray(cat)) {
        return cat
          .map((c: Category) => ({
            id: c.id,
            name: c.name,
            parent_id: c.parent_id,
          }))
          .filter((c: Category) => c.id);
      }
      // single object
      return [{ id: cat.id, name: cat.name, parent_id: cat.parent_id }];
    })(),
    product_variants: (p.product_variants || []).map(
      (variant: ProductVariant) => ({
        id: variant.id,
        name: variant.name,
        price: variant.price,
        image_url: variant.image_url || undefined,
        is_default: variant.is_default,
        description: variant.description || undefined,
      }),
    ),
    modifier_group_products: p.modifier_group_products || [],
    product_ingredients_display: (p.product_ingredients_display || [])
      .filter((pi: ProductIngredientDisplay) => pi.is_visible)
      .map((pi: ProductIngredientDisplay) => {
        const ingredient = pi.ingredients;
        return {
          id: pi.id,
          ingredient_id: pi.ingredient_id,
          is_essential: pi.is_essential || false,
          is_visible: pi.is_visible || false,
          ingredients: ingredient
            ? {
                id: ingredient.id,
                name: ingredient.name,
                sale_price: ingredient.sale_price ?? undefined,
                cost_per_unit: ingredient.cost_per_unit ?? undefined,
              }
            : {
                id: "",
                name: "",
                sale_price: undefined,
                cost_per_unit: undefined,
              },
        };
      }),
    product_extras: (p.product_extras || [])
      .filter((ex: ProductExtra) => ex.is_active)
      .map((ex: ProductExtra) => {
        const ingredient = ex.ingredients;
        return {
          id: ex.id,
          ingredient_id: ex.ingredient_id,
          is_active: ex.is_active || false,
          ingredients: ingredient
            ? {
                id: ingredient.id,
                name: ingredient.name,
                sale_price: ingredient.sale_price ?? undefined,
                cost_per_unit: ingredient.cost_per_unit ?? undefined,
              }
            : {
                id: "",
                name: "",
                sale_price: undefined,
                cost_per_unit: undefined,
              },
        };
      }),
  }));

  return products;
}

/**
 * Obtiene productos específicos por sus IDs (para upsell con suggested_product_ids)
 */
export async function getProductsByIds(
  branchId: string,
  productIds: string[],
): Promise<Product[]> {
  if (productIds.length === 0) return [];

  const { data, error } = await supabaseBrowser
    .from("products")
    .select(
      `
      id,
      name,
      description,
      branch_id,
      category_id,
      allow_half,
      is_hero,
      is_featured,
      is_suggestable,
      show_in_menu,
      categories(
        id,
        name,
        parent_id
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
          id,
          name,
          modifiers(
            id,
            name,
            price
          )
        )
      ),
      product_ingredients_display(
        id,
        ingredient_id,
        is_essential,
        is_visible,
        ingredients(
          id,
          name,
          sale_price,
          cost_per_unit
        )
      ),
      product_extras(
        id,
        ingredient_id,
        is_active,
        ingredients(
          id,
          name,
          sale_price,
          cost_per_unit
        )
      )
    `,
    )
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .in("id", productIds);

  if (error) {
    console.error("Error fetching products by IDs:", error);
    return [];
  }

  return (data as unknown as ProductRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || undefined,
    allow_half: p.allow_half || false,
    is_hero: p.is_hero || false,
    is_featured: p.is_featured || false,
    is_suggestable: p.is_suggestable || false,
    show_in_menu: p.show_in_menu !== undefined ? p.show_in_menu : true,
    categories: (() => {
      const cat = p.categories;
      if (!cat) return [];
      if (Array.isArray(cat)) {
        return cat
          .map((c: Category) => ({
            id: c.id,
            name: c.name,
            parent_id: c.parent_id,
          }))
          .filter((c: Category) => c.id);
      }
      return [{ id: cat.id, name: cat.name, parent_id: cat.parent_id }];
    })(),
    product_variants: (p.product_variants || []).map(
      (variant: ProductVariant) => ({
        id: variant.id,
        name: variant.name,
        price: variant.price,
        image_url: variant.image_url || undefined,
        is_default: variant.is_default,
        description: variant.description || undefined,
      }),
    ),
    modifier_group_products: p.modifier_group_products || [],
    product_ingredients_display: (p.product_ingredients_display || [])
      .filter((pi: ProductIngredientDisplay) => pi.is_visible)
      .map((pi: ProductIngredientDisplay) => {
        const ingredient = pi.ingredients;
        return {
          id: pi.id,
          ingredient_id: pi.ingredient_id,
          is_essential: pi.is_essential || false,
          is_visible: pi.is_visible || false,
          ingredients: ingredient
            ? {
                id: ingredient.id,
                name: ingredient.name,
                sale_price: ingredient.sale_price ?? undefined,
                cost_per_unit: ingredient.cost_per_unit ?? undefined,
              }
            : {
                id: "",
                name: "",
                sale_price: undefined,
                cost_per_unit: undefined,
              },
        };
      }),
    product_extras: (p.product_extras || [])
      .filter((ex: ProductExtra) => ex.is_active)
      .map((ex: ProductExtra) => {
        const ingredient = ex.ingredients;
        return {
          id: ex.id,
          ingredient_id: ex.ingredient_id,
          is_active: ex.is_active || false,
          ingredients: ingredient
            ? {
                id: ingredient.id,
                name: ingredient.name,
                sale_price: ingredient.sale_price ?? undefined,
                cost_per_unit: ingredient.cost_per_unit ?? undefined,
              }
            : {
                id: "",
                name: "",
                sale_price: undefined,
                cost_per_unit: undefined,
              },
        };
      }),
  }));
}

/**
 * Obtiene sugerencias de productos basadas en los items del carrito
 * Retorna productos sugeribles con descuento aplicado según reglas de upsell
 * INCLUYE DOS fuentes:
 * 1. Productos marcados como "solo sugerido" (is_suggestable = true)
 * 2. Productos sugeridos por reglas de upsell basadas en categorías del carrito
 *
 * NOTA: Ya NO incluimos productos con show_in_menu = false (complementarios)
 */
export async function getUpsellSuggestions(
  branchSlug: string,
  cartItems: Array<{ productId?: string; categories?: Array<{ id: string }> }>,
): Promise<
  Array<{
    product: Product;
    discount: number;
    reason: string;
  }>
> {
  // 1. Obtener branch y tenant
  console.log("UPSELL: Fetching branch for slug:", branchSlug);
  const { data: branch, error: branchError } = await supabaseBrowser
    .from("branches")
    .select("id, tenant_id")
    .eq("slug", branchSlug)
    .single();

  if (branchError || !branch) {
    console.error("Error fetching branch:", branchError);
    return [];
  }

  console.log("UPSELL: Branch found:", {
    id: branch.id,
    tenant_id: branch.tenant_id,
  });

  // Si el carrito está vacío, no mostrar sugerencias
  if (cartItems.length === 0) {
    console.log("UPSELL: Cart is empty, no suggestions");
    return [];
  }

  const allSuggestions: Array<{
    product: Product;
    discount: number;
    reason: string;
  }> = [];

  // ============================================
  // FUENTE 1: Productos marcados como "solo sugerido" (is_suggestable = true)
  // ============================================
  console.log("UPSELL: === FUENTE 1: Productos solo sugeridos ===");

  // Obtener TODOS los productos sugeribles de esta sucursal
  const allSuggestableProducts = await getSuggestableProducts(branch.id);
  console.log(
    "UPSELL: Total productos sugeribles:",
    allSuggestableProducts.length,
  );

  // Filtrar productos marcados como "solo sugerido" (is_suggestable = true)
  // IMPORTANTE: show_in_menu puede ser true o false, pero is_suggestable debe ser true
  const suggestableOnlyProducts = allSuggestableProducts.filter(
    (product) => product.is_suggestable === true,
  );

  console.log(
    "UPSELL: Productos solo sugeridos:",
    suggestableOnlyProducts.length,
  );

  // Agregar estos productos con descuento 0 y razón específica
  suggestableOnlyProducts.forEach((product) => {
    // Verificar si ya existe este producto en las sugerencias (para evitar duplicados)
    const alreadyExists = allSuggestions.some(
      (s) => s.product.id === product.id,
    );

    if (!alreadyExists) {
      allSuggestions.push({
        product,
        discount: 0, // Sin descuento especial
        reason: "Solo sugerido",
      });
    }
  });

  // ============================================
  // FUENTE 2: Productos sugeridos por reglas de upsell
  // ============================================
  console.log("UPSELL: === FUENTE 2: Reglas de upsell ===");

  // 2. Obtener reglas de upsell para el tenant
  const upsellRules = await getUpsellRules(branch.tenant_id);
  console.log("UPSELL: Total rules found:", upsellRules.length);

  // Solo procesar reglas si hay productos en el carrito
  if (upsellRules.length > 0 && cartItems.length > 0) {
    // 3. Identificar categorías únicas en el carrito
    const cartCategoryIds = new Set<string>();
    cartItems.forEach((item) => {
      if (item.categories && item.categories.length > 0) {
        item.categories.forEach((cat) => cartCategoryIds.add(cat.id));
      }
    });

    console.log(
      "UPSELL: Unique cart category IDs:",
      Array.from(cartCategoryIds),
    );

    if (cartCategoryIds.size > 0) {
      // 4. Encontrar reglas aplicables (categorías del carrito coinciden con category_id)
      const applicableRules = upsellRules.filter((rule) =>
        cartCategoryIds.has(rule.category_id),
      );

      console.log("UPSELL: Applicable rules:", applicableRules.length);

      if (applicableRules.length > 0) {
        // Separar reglas: las que tienen productos específicos vs las que usan categoría
        const rulesWithSpecificProducts = applicableRules.filter(
          (rule) =>
            rule.suggested_product_ids && rule.suggested_product_ids.length > 0,
        );
        const rulesWithCategory = applicableRules.filter(
          (rule) =>
            !rule.suggested_product_ids ||
            rule.suggested_product_ids.length === 0,
        );

        // 5a. Procesar reglas con productos específicos
        if (rulesWithSpecificProducts.length > 0) {
          const allProductIds = rulesWithSpecificProducts.flatMap(
            (rule) => rule.suggested_product_ids!,
          );
          const uniqueProductIds = [...new Set(allProductIds)];

          const specificProducts = await getProductsByIds(
            branch.id,
            uniqueProductIds,
          );

          for (const product of specificProducts) {
            const alreadyExists = allSuggestions.some(
              (s) => s.product.id === product.id,
            );
            if (alreadyExists) continue;

            // Encontrar la regla con mayor descuento para este producto
            const matchingRules = rulesWithSpecificProducts.filter((rule) =>
              rule.suggested_product_ids?.includes(product.id),
            );
            const bestRule = matchingRules.reduce((prev, current) =>
              prev.discount > current.discount ? prev : current,
            );

            allSuggestions.push({
              product,
              discount: bestRule.discount,
              reason: `Sugerido por comprar ${
                bestRule.category?.name || "productos relacionados"
              }`,
            });
          }
        }

        // 5b. Procesar reglas basadas en categoría
        if (rulesWithCategory.length > 0) {
          const suggestedCategoryIds = rulesWithCategory.map(
            (rule) => rule.suggested_category_id,
          );

          const ruleBasedProducts = await getSuggestableProducts(
            branch.id,
            suggestedCategoryIds,
          );

          for (const product of ruleBasedProducts) {
            const productCategoryId = product.categories[0]?.id;
            if (!productCategoryId) continue;

            const matchingRules = rulesWithCategory.filter(
              (rule) => rule.suggested_category_id === productCategoryId,
            );

            if (matchingRules.length > 0) {
              const bestRule = matchingRules.reduce((prev, current) =>
                prev.discount > current.discount ? prev : current,
              );

              const alreadyExists = allSuggestions.some(
                (s) => s.product.id === product.id,
              );

              if (!alreadyExists) {
                allSuggestions.push({
                  product,
                  discount: bestRule.discount,
                  reason: `Sugerido por comprar ${
                    bestRule.category?.name || "productos relacionados"
                  }`,
                });
              }
            }
          }
        }
      }
    }
  }

  // Limitar a un máximo de sugerencias (priorizar productos con descuento primero)
  const sortedSuggestions = allSuggestions.sort(
    (a, b) => b.discount - a.discount,
  );
  const finalSuggestions = sortedSuggestions.slice(0, 6); // Mostrar hasta 6 sugerencias

  console.log("UPSELL: Final suggestions generated:", finalSuggestions.length);
  console.log("UPSELL: Suggestions breakdown:", {
    total: allSuggestions.length,
    suggestableOnly: suggestableOnlyProducts.length,
    ruleBased: allSuggestions.length - suggestableOnlyProducts.length,
    final: finalSuggestions.length,
  });

  return finalSuggestions;
}
