import { supabaseBrowser as supabase } from "@kablam/supabase/client";

interface ValidateParams {
  code: string;
  tenantId: string;
  phone?: string;
  orderTotal: number;
  shippingCost?: number;
  hasDailyDiscount?: boolean;
}

function normalizePhone(phone?: string | null) {
  return (phone || "").replace(/\D/g, "");
}

function countUsesSince(uses: any[] | null | undefined, date: Date) {
  return (
    uses?.filter((use) => use.used_at && new Date(use.used_at) > date).length ||
    0
  );
}

export async function validateCoupon({
  code,
  tenantId,
  phone,
  orderTotal,
  shippingCost = 0,
  hasDailyDiscount = false,
}: ValidateParams) {
  if (!code) {
    return { valid: false, message: "Código inválido" };
  }

  const normalizedPhone = normalizePhone(phone);

  const { data: coupon } = await supabase
    .from("coupons")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("code", code.trim().toUpperCase())
    .eq("is_active", true)
    .single();

  if (!coupon) {
    return { valid: false, message: "Cupón no encontrado" };
  }

  if (
    coupon.has_expiration &&
    coupon.expires_at &&
    new Date(coupon.expires_at) < new Date()
  ) {
    return { valid: false, message: "Cupón expirado" };
  }

  if (coupon.requires_phone && !normalizedPhone) {
    return {
      valid: false,
      message: "Este cupón requiere WhatsApp",
    };
  }

  if (
    coupon.allowed_phone &&
    normalizePhone(coupon.allowed_phone) !== normalizedPhone
  ) {
    return {
      valid: false,
      message: "Este cupón no es válido para este número",
    };
  }

  if (!coupon.is_accumulable && hasDailyDiscount) {
    return {
      valid: false,
      message: "No combinable con otras promociones",
    };
  }

  const { data: uses } = await supabase
    .from("coupon_uses")
    .select("id, used_at, customer_phone")
    .eq("coupon_id", coupon.id);

  const scopedUses =
    coupon.usage_scope === "phone" && normalizedPhone
      ? uses?.filter(
          (use) => normalizePhone(use.customer_phone) === normalizedPhone,
        )
      : uses;

  const totalUses = scopedUses?.length || 0;

  if (coupon.usage_type === "one_time" && totalUses > 0) {
    return {
      valid: false,
      message:
        coupon.usage_scope === "phone"
          ? "Este WhatsApp ya usó el cupón"
          : "Cupón ya utilizado",
    };
  }

  if (
    coupon.usage_type === "limited" &&
    coupon.usage_limit &&
    totalUses >= coupon.usage_limit
  ) {
    return {
      valid: false,
      message: "Se alcanzó el límite de usos",
    };
  }

  if (coupon.usage_type === "weekly_limited") {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    if (
      coupon.weekly_limit &&
      countUsesSince(scopedUses, oneWeekAgo) >= coupon.weekly_limit
    ) {
      return {
        valid: false,
        message: "Límite semanal alcanzado",
      };
    }
  }

  if (coupon.usage_type === "monthly_limited") {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    if (
      coupon.monthly_limit &&
      countUsesSince(scopedUses, oneMonthAgo) >= coupon.monthly_limit
    ) {
      return {
        valid: false,
        message: "Límite mensual alcanzado",
      };
    }
  }

  let discountAmount = 0;

  if (coupon.discount_type === "percentage") {
    discountAmount = (orderTotal * Number(coupon.discount_value)) / 100;
  }

  if (coupon.discount_type === "fixed") {
    discountAmount = Number(coupon.discount_value);
  }

  if (coupon.discount_type === "free_shipping") {
    discountAmount = shippingCost;
  }

  if (
    coupon.discount_type !== "free_shipping" &&
    discountAmount > orderTotal
  ) {
    discountAmount = orderTotal;
  }

  return {
    valid: true,
    discountAmount,
    coupon,
  };
}
