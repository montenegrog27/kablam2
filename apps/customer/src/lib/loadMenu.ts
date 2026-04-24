import { supabaseBrowser } from "@kablam/supabase/client";
import { createSupabaseServer } from "@kablam/supabase/server";
import type { Product } from "../types/menu";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  branch_id: string;
  category_id?: string | null;
  allow_half: boolean;
  is_hero?: boolean;
  is_featured?: boolean;
  is_suggestable?: boolean;
  show_in_menu?: boolean;
  categories: {
    id: string;
    name: string;
    parent_id: string | null;
  } | null;
  product_variants: Array<{
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    is_default: boolean;
    description: string | null;
  }>;
  modifier_group_products: Array<{
    modifier_groups: {
      id: string;
      name: string;
      modifiers: Array<{
        id: string;
        name: string;
        price: number;
      }>;
    };
  }>;
  product_ingredients_display: Array<{
    id: string;
    ingredient_id: string;
    is_essential: boolean;
    is_visible: boolean;
    ingredients: {
      id: string;
      name: string;
      sale_price: number | null;
      cost_per_unit: number | null;
    } | null;
  }>;
  product_extras: Array<{
    id: string;
    ingredient_id: string;
    is_active: boolean;
    ingredients: {
      id: string;
      name: string;
      sale_price: number | null;
      cost_per_unit: number | null;
    } | null;
  }>;
};

export async function loadMenu(
  branchSlug: string,
  supabaseClient?: SupabaseClient,
): Promise<Product[]> {
  // Usar cliente proporcionado o crear uno por defecto
  const supabase = supabaseClient || supabaseBrowser;

  const { data: branch } = await supabase
    .from("branches")
    .select("*")
    .ilike("slug", branchSlug)
    .limit(1)
    .single();

  if (!branch) return [];

  const { data, error } = await supabase
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
    .eq("branch_id", branch.id)
    .eq("is_active", true)
    .eq("show_in_menu", true);

  if (error) {
    console.error("Error loading menu:", error);
    return [];
  }

  console.log("loadMenu: Raw data count:", data?.length || 0);
  console.log(
    "loadMenu: Sample product with categories:",
    data?.[0]
      ? {
          name: data[0].name,
          category_id: data[0].category_id,
          categories: data[0].categories,
        }
      : null,
  );

  const menu: Product[] = ((data as unknown as ProductRow[]) || []).map(
    (p) => ({
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      branch_id: p.branch_id,
      allow_half: p.allow_half || false,
      is_hero: p.is_hero || false,
      is_featured: p.is_featured || false,
      is_suggestable: p.is_suggestable || false,
      show_in_menu: p.show_in_menu !== undefined ? p.show_in_menu : true,
      categories: p.categories
        ? [
            {
              id: p.categories.id,
              name: p.categories.name,
              parent_id: p.categories.parent_id,
            },
          ]
        : [],
      product_variants: (p.product_variants || []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        price: variant.price,
        image_url: variant.image_url || undefined,
        is_default: variant.is_default,
        description: variant.description || undefined,
      })),
      modifier_group_products: p.modifier_group_products || [],
      product_ingredients_display: (p.product_ingredients_display || [])
        .filter((pi) => pi.is_visible)
        .map((pi) => {
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
        .filter((ex) => ex.is_active)
        .map((ex) => {
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
    }),
  );

  return menu;
}

// Versión para servidor
export async function loadMenuServer(branchSlug: string): Promise<Product[]> {
  const supabase = await createSupabaseServer();
  return loadMenu(branchSlug, supabase);
}
