import { supabaseBrowser as supabase } from "@kablam/supabase/client";

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

  /* =============================
     1. BUSCAR CUPÓN
  ============================= */

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

  /* =============================
     2. EXPIRACIÓN
  ============================= */

  if (
    coupon.has_expiration &&
    coupon.expires_at &&
    new Date(coupon.expires_at) < new Date()
  ) {
    return { valid: false, message: "Cupón expirado" };
  }

  /* =============================
     3. TELÉFONO
  ============================= */

// validateCoupon.ts

if (coupon.requires_phone) {
  // 1️⃣ Debe haber teléfono
  if (!phone) {
    return {
      valid: false,
      message: "Este cupón requiere teléfono",
    };
  }

  // 2️⃣ Normalizar teléfono
  const normalizedPhone = phone.replace(/\D/g, "");

  // 3️⃣ Comparar con allowed_phone (si existe)
  if (
    coupon.allowed_phone &&
    coupon.allowed_phone !== normalizedPhone
  ) {
    return {
      valid: false,
      message: "Este cupón no es válido para este número",
    };
  }
}

  /* =============================
     4. USOS
  ============================= */

  const { data: uses } = await supabase
    .from("coupon_uses")
    .select("id, used_at")
    .eq("coupon_id", coupon.id);

  const totalUses = uses?.length || 0;

  if (coupon.usage_type === "one_time" && totalUses > 0) {
    return { valid: false, message: "Cupón ya utilizado" };
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

  /* =============================
     5. DESCUENTO
  ============================= */

  let discountAmount = 0;

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