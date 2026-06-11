import type { CartItem, Product } from "@/types/menu";

export type LoyaltyRule = {
  id: string;
  name: string;
  type: "points" | "product_points" | "combo_points" | "category_points" | "extra_points" | "product_accumulation";
  points_per_amount?: number | null;
  points_per_unit?: number | null;
  points_per_extra_peso?: number | null;
  minimum_amount?: number | null;
  product_id?: string | null;
  combo_id?: string | null;
  category_id?: string | null;
  is_active?: boolean;
};

export type LoyaltyLevel = {
  name: string;
  minPoints: number;
  maxPoints: number | null;
};

export type LoyaltyProgram = {
  authenticated: boolean;
  rules: LoyaltyRule[];
  levels: LoyaltyLevel[];
};

type LoyaltyComboProduct = {
  productId: string;
  categoryId?: string | null;
  quantity: number;
};

export function describeLoyaltyRule(rule: LoyaltyRule) {
  if (rule.type === "points") {
    return `Cada $${formatNumber(rule.points_per_amount || 1000)} suma 1 punto`;
  }
  if (rule.type === "product_points") {
    return `Productos seleccionados: +${rule.points_per_unit || 0} pts por unidad`;
  }
  if (rule.type === "combo_points") {
    return `Combos seleccionados: +${rule.points_per_unit || 0} pts por combo`;
  }
  if (rule.type === "category_points") {
    return `Categoria seleccionada: +${rule.points_per_unit || 0} pts por unidad`;
  }
  if (rule.type === "extra_points") {
    return `Extras: +${rule.points_per_unit || 0} pts por extra agregado`;
  }
  return "Acumulacion de compras para recompensas";
}

export function getProductLoyaltyEstimate(product: Product, rules: LoyaltyRule[]) {
  const price = getProductPrice(product);
  const categoryIds = getProductCategoryIds(product);
  const comboProducts = getProductComboProducts(product);
  let points = 0;
  let extrasHint = false;
  let extrasPointsPerExtra = 0;

  rules.filter((rule) => rule.is_active !== false).forEach((rule) => {
    if (rule.type === "points") {
      if (price >= Number(rule.minimum_amount || 0)) {
        points += Math.floor(price / Math.max(Number(rule.points_per_amount || 1000), 1));
      }
      return;
    }

    if (rule.type === "product_points" && product.itemType !== "combo") {
      if (!rule.product_id || rule.product_id === product.id) {
        points += Number(rule.points_per_unit || 0);
      }
      return;
    }

    if (rule.type === "combo_points" && product.itemType === "combo") {
      const comboId = product.comboId || product.id;
      if (!rule.combo_id || rule.combo_id === comboId) {
        points += Number(rule.points_per_unit || 0);
      }
      return;
    }

    if (rule.type === "category_points" && rule.category_id) {
      if (product.itemType === "combo") {
        const units = comboProducts
          .filter((comboProduct) => comboProduct.categoryId === rule.category_id)
          .reduce((sum, comboProduct) => sum + comboProduct.quantity, 0);
        points += units * Number(rule.points_per_unit || 0);
      } else if (categoryIds.includes(rule.category_id)) {
        points += Number(rule.points_per_unit || 0);
      }
      return;
    }

    if (rule.type === "extra_points") {
      extrasHint = true;
      extrasPointsPerExtra += Number(rule.points_per_unit || 0);
    }
  });

  return {
    points: Math.max(0, Math.floor(points)),
    extrasHint,
    extrasPointsPerExtra: Math.max(0, Math.floor(extrasPointsPerExtra)),
  };
}

export function getCartLoyaltyEstimate(cart: CartItem[], rules: LoyaltyRule[]) {
  let points = 0;
  let extrasPoints = 0;
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);

  rules.filter((rule) => rule.is_active !== false && rule.type === "points").forEach((rule) => {
    if (subtotal >= Number(rule.minimum_amount || 0)) {
      points += Math.floor(subtotal / Math.max(Number(rule.points_per_amount || 1000), 1));
    }
  });

  cart.forEach((item) => {
    const quantity = Number(item.quantity || 1);
    const categoryIds = item.loyaltyCategoryIds || (item.categories || []).map((category) => category.id);
    const comboProducts = item.comboProducts || [];
    const extrasCount = (item.extras || []).length * quantity;

    rules.filter((rule) => rule.is_active !== false).forEach((rule) => {
      if (rule.type === "product_points" && item.itemType !== "combo") {
        if (!rule.product_id || rule.product_id === item.productId) {
          points += Number(rule.points_per_unit || 0) * quantity;
        }
        return;
      }

      if (rule.type === "combo_points" && item.itemType === "combo") {
        if (!rule.combo_id || rule.combo_id === item.comboId) {
          points += Number(rule.points_per_unit || 0) * quantity;
        }
        return;
      }

      if (rule.type === "category_points" && rule.category_id) {
        if (item.itemType === "combo") {
          const units = comboProducts
            .filter((comboProduct) => comboProduct.categoryId === rule.category_id)
            .reduce((sum, comboProduct) => sum + comboProduct.quantity, 0);
          points += units * quantity * Number(rule.points_per_unit || 0);
        } else if (categoryIds.includes(rule.category_id)) {
          points += Number(rule.points_per_unit || 0) * quantity;
        }
        return;
      }

      if (rule.type === "extra_points") {
        const value = extrasCount * Number(rule.points_per_unit || 0);
        extrasPoints += value;
        points += value;
      }
    });
  });

  return {
    points: Math.max(0, Math.floor(points)),
    extrasPoints: Math.max(0, Math.floor(extrasPoints)),
  };
}

export function getProductCategoryIds(product: Product) {
  return (product.categories || []).map((category) => category.id).filter(Boolean);
}

export function getProductComboProducts(product: Product): LoyaltyComboProduct[] {
  return (product.combo_products || [])
    .map((comboProduct: any) => ({
      productId: String(comboProduct.product_id || comboProduct.products?.id || ""),
      categoryId: comboProduct.products?.category_id || null,
      quantity: Number(comboProduct.quantity || 1),
    }))
    .filter((comboProduct: LoyaltyComboProduct) => Boolean(comboProduct.productId));
}

function getProductPrice(product: Product) {
  const defaultVariant = product.product_variants?.find((variant) => variant.is_default) || product.product_variants?.[0];
  return Number(defaultVariant?.price || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value || 0);
}
