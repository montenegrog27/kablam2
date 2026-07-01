import { createSupabaseServer } from "@kablam/supabase/server";

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  position: number | null;
  qr_position: number | null;
  qr_visible: boolean | null;
  catalog_position: number | null;
  catalog_visible: boolean | null;
  active: boolean | null;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  gallery_images: string[] | null;
  catalog_price_mode: "priced" | "consult" | null;
  catalog_cta_label: string | null;
  pricing_mode: "unit" | "kg" | "portion" | null;
  qr_position: number | null;
  qr_visible: boolean | null;
  catalog_position: number | null;
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

type ComboRow = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  price: number | null;
  is_active: boolean | null;
  combo_products?: Array<{
    product_id: string;
    quantity: number | null;
    products?: {
      id: string;
      name: string;
      product_variants?: Array<{
        id: string;
        name: string;
        price: number;
        image_url: string | null;
        is_default: boolean;
        sort_order: number | null;
      }>;
    } | null;
  }>;
};

export type QrMenuProduct = {
  id: string;
  itemType?: "product" | "combo";
  name: string;
  description?: string;
  price: number;
  catalogPriceMode?: "priced" | "consult";
  catalogCtaLabel?: string;
  originalPrice?: number;
  salePrice?: number;
  saleBadge?: string;
  imageUrl?: string;
  galleryImages?: string[];
  pricingMode?: "unit" | "kg" | "portion";
  variants: Array<{
    id: string;
    name: string;
    price: number;
    originalPrice?: number;
    salePrice?: number;
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
    min_advance_days?: number | null;
    show_date?: boolean | null;
    show_note?: boolean | null;
    form_title?: string | null;
    submit_label?: string | null;
  };
  categories: QrMenuCategory[];
};

function getVariant(product: ProductRow) {
  return product.product_variants?.find((variant) => variant.is_default) || product.product_variants?.[0];
}

function orderValue(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function getMenuFields(mode: "qr" | "catalog") {
  return mode === "catalog"
    ? {
        categoryPosition: "catalog_position" as const,
        categoryVisible: "catalog_visible" as const,
        productPosition: "catalog_position" as const,
        productVisible: "catalog_visible" as const,
      }
    : {
        categoryPosition: "qr_position" as const,
        categoryVisible: "qr_visible" as const,
        productPosition: "qr_position" as const,
        productVisible: "qr_visible" as const,
      };
}

function getSalePrice(price: number, sale: any) {
  if (!sale) return price;
  const discount = Math.min(100, Math.max(0, Number(sale.discount_percentage || 0)));
  return Math.max(0, Math.round(Number(price || 0) * (1 - discount / 100)));
}

function getSaleBadge(sale: any) {
  if (!sale) return undefined;
  return sale.display_type === "label" ? sale.display_label : `-${sale.discount_percentage}%`;
}

function normalizeGalleryImages(product: ProductRow, mainImage?: string | null) {
  const gallery = Array.isArray(product.gallery_images)
    ? product.gallery_images.filter(Boolean).map(String)
    : [];
  const allImages = [mainImage || "", ...gallery].filter(Boolean);
  return Array.from(new Set(allImages));
}

function getComboImage(combo: ComboRow) {
  for (const item of combo.combo_products || []) {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    const variants = product?.product_variants || [];
    const variant = variants.find((row: { is_default?: boolean }) => row.is_default) || variants[0];
    if (variant?.image_url) return variant.image_url;
  }
  return undefined;
}

export async function loadQrMenu(
  branchSlug: string,
  mode: "qr" | "catalog" = "qr",
): Promise<QrMenuData | null> {
  const supabase = await createSupabaseServer();
  const fields = getMenuFields(mode);

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, slug, tenant_id, phone")
    .eq("slug", branchSlug)
    .maybeSingle();

  if (!branch) return null;

  const saleChannelColumn = mode === "catalog" ? "show_in_catalog" : "show_in_qr";
  const now = new Date().toISOString();
  const [{ data: branding }, { data: categories }, { data: products }, { data: combos }, { data: flashSales }] = await Promise.all([
    supabase
      .from("branch_settings")
      .select("logo_url, loading_icon_url, background_color, brand_color, accent_color, font_family, font_url, catalog_order_whatsapp_phone, catalog_order_deposit_enabled, catalog_order_deposit_percent, catalog_order_transfer_alias, catalog_order_instructions, catalog_order_show_delivery_address, catalog_order_show_pickup_addresses, catalog_order_pickup_addresses, catalog_order_advance_days, catalog_order_min_advance_days, catalog_order_show_date, catalog_order_show_note, catalog_order_form_title, catalog_order_submit_label")
      .eq("branch_id", branch.id)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, name, parent_id, position, qr_position, qr_visible, catalog_position, catalog_visible, active")
      .eq("tenant_id", branch.tenant_id)
      .order(fields.categoryPosition, { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("products")
      .select(
        `
          id,
          name,
          description,
          category_id,
          gallery_images,
          catalog_price_mode,
          catalog_cta_label,
          pricing_mode,
          qr_position,
          qr_visible,
          catalog_position,
          catalog_visible,
          product_variants(id, name, price, image_url, is_default, sort_order)
        `,
      )
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .order(fields.productPosition, { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("combos")
      .select(
        `
          id,
          name,
          description,
          category_id,
          price,
          is_active,
          combo_products(
            product_id,
            quantity,
            products(
              id,
              name,
              product_variants(id, name, price, image_url, is_default, sort_order)
            )
          )
        `,
      )
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("flash_sales")
      .select("*, flash_sale_categories!left(category_id)")
      .eq("tenant_id", branch.tenant_id)
      .eq("is_active", true)
      .eq(saleChannelColumn, true)
      .lte("start_at", now)
      .gte("end_at", now),
  ]);

  const visibleCategories = ((categories || []) as CategoryRow[])
    .filter((category) => category.active !== false && category[fields.categoryVisible] !== false)
    .sort(
      (a, b) =>
        orderValue(a[fields.categoryPosition], orderValue(a.position)) -
        orderValue(b[fields.categoryPosition], orderValue(b.position)),
    );

  const categoryById = new Map(visibleCategories.map((category) => [category.id, category]));
  const saleByCategory = new Map<string, any>();
  (flashSales || []).forEach((sale: any) => {
    (sale.flash_sale_categories || []).forEach((row: any) => {
      if (row.category_id) saleByCategory.set(row.category_id, sale);
    });
  });
  const productsByCategory = new Map<string, QrMenuProduct[]>();

  ((products || []) as ProductRow[])
    .filter((product) => {
      const visibleForMode = product[fields.productVisible] !== false;
      return visibleForMode && product.category_id && categoryById.has(product.category_id);
    })
    .sort((a, b) => orderValue(a[fields.productPosition]) - orderValue(b[fields.productPosition]) || a.name.localeCompare(b.name))
    .forEach((product) => {
      const variant = getVariant(product);
      if (!variant || !product.category_id) return;
      const sale = saleByCategory.get(product.category_id);
      const price = Number(variant.price || 0);
      const salePrice = sale ? getSalePrice(price, sale) : price;
      const galleryImages = normalizeGalleryImages(product, variant.image_url);
      const current = productsByCategory.get(product.category_id) || [];
      current.push({
        id: product.id,
        itemType: "product",
        name: product.name,
        description: product.description || undefined,
        price: salePrice,
        catalogPriceMode: product.catalog_price_mode || "priced",
        catalogCtaLabel: product.catalog_cta_label || undefined,
        originalPrice: sale ? price : undefined,
        salePrice: sale ? salePrice : undefined,
        saleBadge: getSaleBadge(sale),
        imageUrl: galleryImages[0] || undefined,
        galleryImages,
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
            price: sale ? getSalePrice(Number(item.price || 0), sale) : Number(item.price || 0),
            originalPrice: sale ? Number(item.price || 0) : undefined,
            salePrice: sale ? getSalePrice(Number(item.price || 0), sale) : undefined,
            imageUrl: item.image_url || undefined,
            isDefault: Boolean(item.is_default),
          })),
      });
      productsByCategory.set(product.category_id, current);
    });

  ((combos || []) as unknown as ComboRow[])
    .filter((combo) => combo.category_id && categoryById.has(combo.category_id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((combo) => {
      if (!combo.category_id) return;
      const price = Number(combo.price || 0);
      const imageUrl = getComboImage(combo);
      const current = productsByCategory.get(combo.category_id) || [];

      current.push({
        id: combo.id,
        itemType: "combo",
        name: combo.name,
        description: combo.description || undefined,
        price,
        catalogPriceMode: "priced",
        imageUrl,
        galleryImages: imageUrl ? [imageUrl] : [],
        pricingMode: "unit",
        variants: [
          {
            id: `${combo.id}-combo`,
            name: combo.name,
            price,
            imageUrl,
            isDefault: true,
          },
        ],
      });
      productsByCategory.set(combo.category_id, current);
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
      min_advance_days: Math.max(0, Number(branding?.catalog_order_min_advance_days || 0)),
      show_date: branding?.catalog_order_show_date ?? true,
      show_note: branding?.catalog_order_show_note ?? true,
      form_title: branding?.catalog_order_form_title || null,
      submit_label: branding?.catalog_order_submit_label || null,
    },
    categories: menuCategories,
  };
}
