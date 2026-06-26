import { createSupabaseServer } from "@kablam/supabase/server";

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  position: number | null;
  qr_position: number | null;
  qr_visible: boolean | null;
  active: boolean | null;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  pricing_mode: "unit" | "kg" | "portion" | null;
  qr_position: number | null;
  qr_visible: boolean | null;
  catalog_visible: boolean | null;
  product_variants: Array<{
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    is_default: boolean;
    sort_order: number | null;
  }>;
};

export type QrMenuProduct = {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  pricingMode?: "unit" | "kg" | "portion";
  variants: Array<{
    id: string;
    name: string;
    price: number;
    imageUrl?: string;
    isDefault: boolean;
  }>;
};

export type QrMenuCategory = {
  id: string;
  name: string;
  parentName?: string;
  products: QrMenuProduct[];
};

export type QrMenuData = {
  branch: {
    id: string;
    name: string;
    slug: string;
    tenant_id: string;
    phone?: string | null;
  };
  branding: {
    logo_url?: string;
    loading_icon_url?: string;
    background_color?: string;
    brand_color?: string;
    accent_color?: string;
    font_family?: string;
    font_url?: string;
  } | null;
  catalogOrder: {
    whatsapp_phone?: string | null;
    deposit_enabled?: boolean | null;
    deposit_percent?: number | null;
    transfer_alias?: string | null;
    instructions?: string | null;
    show_delivery_address?: boolean | null;
    show_pickup_addresses?: boolean | null;
    pickup_addresses?: string[] | null;
    advance_days?: number | null;
  };
  categories: QrMenuCategory[];
};

function getVariant(product: ProductRow) {
  return product.product_variants?.find((variant) => variant.is_default) || product.product_variants?.[0];
}

function orderValue(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export async function loadQrMenu(
  branchSlug: string,
  mode: "qr" | "catalog" = "qr",
): Promise<QrMenuData | null> {
  const supabase = await createSupabaseServer();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, slug, tenant_id, phone")
    .eq("slug", branchSlug)
    .maybeSingle();

  if (!branch) return null;

  const [{ data: branding }, { data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("branch_settings")
      .select("logo_url, loading_icon_url, background_color, brand_color, accent_color, font_family, font_url, catalog_order_whatsapp_phone, catalog_order_deposit_enabled, catalog_order_deposit_percent, catalog_order_transfer_alias, catalog_order_instructions, catalog_order_show_delivery_address, catalog_order_show_pickup_addresses, catalog_order_pickup_addresses, catalog_order_advance_days")
      .eq("branch_id", branch.id)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, name, parent_id, position, qr_position, qr_visible, active")
      .eq("tenant_id", branch.tenant_id)
      .order("qr_position", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("products")
      .select(
        `
          id,
          name,
          description,
          category_id,
          pricing_mode,
          qr_position,
          qr_visible,
          catalog_visible,
          product_variants(id, name, price, image_url, is_default, sort_order)
        `,
      )
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .order("qr_position", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const visibleCategories = ((categories || []) as CategoryRow[])
    .filter((category) => category.active !== false && category.qr_visible !== false)
    .sort((a, b) => orderValue(a.qr_position, orderValue(a.position)) - orderValue(b.qr_position, orderValue(b.position)));

  const categoryById = new Map(visibleCategories.map((category) => [category.id, category]));
  const productsByCategory = new Map<string, QrMenuProduct[]>();

  ((products || []) as ProductRow[])
    .filter((product) => {
      const visibleForMode = mode === "catalog"
        ? product.catalog_visible !== false
        : product.qr_visible !== false;
      return visibleForMode && product.category_id && categoryById.has(product.category_id);
    })
    .sort((a, b) => orderValue(a.qr_position) - orderValue(b.qr_position) || a.name.localeCompare(b.name))
    .forEach((product) => {
      const variant = getVariant(product);
      if (!variant || !product.category_id) return;
      const current = productsByCategory.get(product.category_id) || [];
      current.push({
        id: product.id,
        name: product.name,
        description: product.description || undefined,
        price: Number(variant.price || 0),
        imageUrl: variant.image_url || undefined,
        pricingMode: product.pricing_mode || "unit",
        variants: (product.product_variants || [])
          .sort(
            (a, b) =>
              orderValue(a.sort_order) - orderValue(b.sort_order) ||
              Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)),
          )
          .map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price || 0),
            imageUrl: item.image_url || undefined,
            isDefault: Boolean(item.is_default),
          })),
      });
      productsByCategory.set(product.category_id, current);
    });

  const menuCategories = visibleCategories
    .map((category) => ({
      id: category.id,
      name: category.name,
      parentName: category.parent_id ? categoryById.get(category.parent_id)?.name : undefined,
      products: productsByCategory.get(category.id) || [],
    }))
    .filter((category) => category.products.length > 0);

  return {
    branch,
    branding: branding || null,
    catalogOrder: {
      whatsapp_phone: branding?.catalog_order_whatsapp_phone || branch.phone || null,
      deposit_enabled: branding?.catalog_order_deposit_enabled ?? false,
      deposit_percent: branding?.catalog_order_deposit_percent ?? 50,
      transfer_alias: branding?.catalog_order_transfer_alias || null,
      instructions: branding?.catalog_order_instructions || null,
      show_delivery_address: branding?.catalog_order_show_delivery_address ?? true,
      show_pickup_addresses: branding?.catalog_order_show_pickup_addresses ?? false,
      pickup_addresses: Array.isArray(branding?.catalog_order_pickup_addresses)
        ? branding.catalog_order_pickup_addresses.filter(Boolean).map(String)
        : [],
      advance_days: Math.max(1, Number(branding?.catalog_order_advance_days || 10)),
    },
    categories: menuCategories,
  };
}
