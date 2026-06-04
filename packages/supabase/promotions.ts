export type PromotionRuleType =
  | "percentage"
  | "fixed"
  | "free_shipping"
  | "minimum_amount"
  | "buy_x_get_y"
  | "second_unit"
  | "category"
  | "days"
  | "hours"
  | "payment_method";

export type PromotionCartItem = {
  id?: string;
  productId?: string | null;
  comboId?: string | null;
  categoryId?: string | null;
  name?: string;
  quantity: number;
  unitPrice: number;
  total?: number;
};

export type PromotionCart = {
  items: PromotionCartItem[];
  subtotal: number;
  shippingCost?: number;
  branchId?: string | null;
  customerId?: string | null;
  paymentMethodId?: string | null;
  now?: Date | string;
};

export type PromotionRule = {
  id: string;
  name: string;
  type: PromotionRuleType;
  active?: boolean;
  priority?: number;
  stackable?: boolean;
  discountValue?: number | null;
  discountType?: "percentage" | "fixed" | "free_shipping" | null;
  minimumAmount?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  secondUnitDiscountPercent?: number | null;
  validProducts?: string[] | null;
  validCombos?: string[] | null;
  validCategories?: string[] | null;
  validBranches?: string[] | null;
  daysOfWeek?: number[] | null;
  startDate?: string | null;
  endDate?: string | null;
  startHour?: string | null;
  endHour?: string | null;
  paymentMethods?: string[] | null;
  usageLimit?: number | null;
  usageCount?: number | null;
};

export type AppliedPromotion = {
  id: string;
  name: string;
  type: PromotionRuleType;
  discountAmount: number;
  priority: number;
  stackable: boolean;
};

export type PromotionCalculationResult = {
  appliedPromotions: AppliedPromotion[];
  totalDiscount: number;
  finalTotal: number;
};

function asArray(value?: string[] | null) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function itemTotal(item: PromotionCartItem) {
  return Number(item.total ?? item.unitPrice * item.quantity);
}

function ruleMatchesItems(rule: PromotionRule, cart: PromotionCart) {
  const products = asArray(rule.validProducts);
  const combos = asArray(rule.validCombos);
  const categories = asArray(rule.validCategories);
  if (products.length === 0 && combos.length === 0 && categories.length === 0) return true;

  return cart.items.some((item) =>
    (item.productId && products.includes(item.productId)) ||
    (item.comboId && combos.includes(item.comboId)) ||
    (item.categoryId && categories.includes(item.categoryId)),
  );
}

function eligibleItems(rule: PromotionRule, cart: PromotionCart) {
  const products = asArray(rule.validProducts);
  const combos = asArray(rule.validCombos);
  const categories = asArray(rule.validCategories);
  if (products.length === 0 && combos.length === 0 && categories.length === 0) return cart.items;

  return cart.items.filter((item) =>
    (item.productId && products.includes(item.productId)) ||
    (item.comboId && combos.includes(item.comboId)) ||
    (item.categoryId && categories.includes(item.categoryId)),
  );
}

function isRuleActive(rule: PromotionRule, cart: PromotionCart) {
  if (rule.active === false) return false;
  if (rule.usageLimit && Number(rule.usageCount || 0) >= rule.usageLimit) return false;
  if (rule.minimumAmount && cart.subtotal < rule.minimumAmount) return false;
  if (!ruleMatchesItems(rule, cart)) return false;

  const branches = asArray(rule.validBranches);
  if (branches.length > 0 && (!cart.branchId || !branches.includes(cart.branchId))) return false;

  const paymentMethods = asArray(rule.paymentMethods);
  if (paymentMethods.length > 0 && (!cart.paymentMethodId || !paymentMethods.includes(cart.paymentMethodId))) return false;

  const now = cart.now ? new Date(cart.now) : new Date();
  if (rule.startDate && now < new Date(rule.startDate)) return false;
  if (rule.endDate && now > new Date(rule.endDate)) return false;

  const days = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : [];
  if (days.length > 0 && !days.includes(now.getDay())) return false;

  if (rule.startHour && rule.endHour) {
    const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (current < rule.startHour || current > rule.endHour) return false;
  }

  return true;
}

function calculateRuleDiscount(rule: PromotionRule, cart: PromotionCart) {
  const items = eligibleItems(rule, cart);
  const eligibleSubtotal = items.reduce((sum, item) => sum + itemTotal(item), 0);
  const value = Number(rule.discountValue || 0);

  if (rule.type === "free_shipping" || rule.discountType === "free_shipping") {
    return Number(cart.shippingCost || 0);
  }

  if (rule.type === "fixed" || rule.discountType === "fixed") {
    return Math.min(value, cart.subtotal);
  }

  if (
    rule.type === "percentage" ||
    rule.type === "minimum_amount" ||
    rule.type === "category" ||
    rule.type === "days" ||
    rule.type === "hours" ||
    rule.type === "payment_method" ||
    rule.discountType === "percentage"
  ) {
    return eligibleSubtotal * (value / 100);
  }

  if (rule.type === "second_unit") {
    const percent = Number(rule.secondUnitDiscountPercent || value || 50);
    return items.reduce((sum, item) => {
      const discountedUnits = Math.floor(Number(item.quantity || 0) / 2);
      return sum + discountedUnits * Number(item.unitPrice || 0) * (percent / 100);
    }, 0);
  }

  if (rule.type === "buy_x_get_y") {
    const buy = Math.max(1, Number(rule.buyQuantity || 2));
    const get = Math.max(1, Number(rule.getQuantity || 1));
    return items.reduce((sum, item) => {
      const groupSize = buy + get;
      const freeUnits = Math.floor(Number(item.quantity || 0) / groupSize) * get;
      return sum + freeUnits * Number(item.unitPrice || 0);
    }, 0);
  }

  return 0;
}

export function calculatePromotions(cart: PromotionCart, rules: PromotionRule[]): PromotionCalculationResult {
  const candidates = rules
    .filter((rule) => isRuleActive(rule, cart))
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      type: rule.type,
      discountAmount: Math.max(0, Math.round(calculateRuleDiscount(rule, cart))),
      priority: Number(rule.priority || 0),
      stackable: rule.stackable !== false,
    }))
    .filter((rule) => rule.discountAmount > 0)
    .sort((a, b) => b.priority - a.priority || b.discountAmount - a.discountAmount);

  const firstNonStackable = candidates.find((rule) => !rule.stackable);
  const appliedPromotions = firstNonStackable
    ? [firstNonStackable, ...candidates.filter((rule) => rule.stackable && rule.priority > firstNonStackable.priority)]
    : candidates;

  const totalDiscount = Math.min(
    cart.subtotal + Number(cart.shippingCost || 0),
    appliedPromotions.reduce((sum, rule) => sum + rule.discountAmount, 0),
  );

  return {
    appliedPromotions,
    totalDiscount,
    finalTotal: Math.max(0, cart.subtotal + Number(cart.shippingCost || 0) - totalDiscount),
  };
}
