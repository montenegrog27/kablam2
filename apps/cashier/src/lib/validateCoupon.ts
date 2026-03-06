import { supabase } from "@kablam/supabase";

interface ValidateParams {
  code: string;
  tenantId: string;
  phone?: string;
  orderTotal: number;
  shippingCost?: number;
  hasDailyDiscount?: boolean;
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

  // 1️⃣ Buscar cupón
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

  // 2️⃣ Expiración
  if (
    coupon.has_expiration &&
    coupon.expires_at &&
    new Date(coupon.expires_at) < new Date()
  ) {
    return { valid: false, message: "Cupón expirado" };
  }

  // 3️⃣ Requiere teléfono
  if (coupon.requires_phone) {
    if (!phone) {
      return {
        valid: false,
        message: "Este cupón requiere teléfono",
      };
    }

    if (coupon.allowed_phone && coupon.allowed_phone !== phone) {
      return {
        valid: false,
        message: "Este cupón no es válido para este número",
      };
    }
  }

  // 4️⃣ Acumulable
  if (!coupon.is_accumulable && hasDailyDiscount) {
    return {
      valid: false,
      message: "No combinable con otras promociones",
    };
  }

  // 5️⃣ Reglas de uso
  const { data: uses } = await supabase
    .from("coupon_uses")
    .select("id, used_at")
    .eq("coupon_id", coupon.id);

  const totalUses = uses?.length || 0;

  if (coupon.usage_type === "one_time" && totalUses > 0) {
    return {
      valid: false,
      message: "Cupón ya utilizado",
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

    const weeklyUses =
  uses?.filter(
    (u) =>
      u.used_at &&
      new Date(u.used_at) > oneWeekAgo
  ).length || 0;

    if (coupon.weekly_limit && weeklyUses >= coupon.weekly_limit) {
      return {
        valid: false,
        message: "Límite semanal alcanzado",
      };
    }
  }

  // 6️⃣ Calcular descuento
  let discountAmount = 0;

  if (coupon.discount_type === "percentage") {
    discountAmount = (orderTotal * Number(coupon.discount_value)) / 100;
  }

  if (coupon.discount_type === "fixed") {
    discountAmount = Number(coupon.discount_value);
  }

if (coupon.discount_type === "percentage") {
  discountAmount =
    (orderTotal * Number(coupon.discount_value)) / 100;
}

if (coupon.discount_type === "fixed") {
  discountAmount = Number(coupon.discount_value);
}

if (coupon.discount_type === "free_shipping") {
  discountAmount = shippingCost;
}

// Solo limitar si NO es envío gratis
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
