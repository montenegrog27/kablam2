import { createClient } from "@supabase/supabase-js";
import { logAppError } from "@/lib/logAppError";
import { getBranchAvailability } from "@/lib/branchAvailability";

type OrderItemInput = {
  itemType?: "product" | "combo" | "promotion";
  productId?: string;
  comboId?: string;
  variantId: string;
  quantity: number;
  name?: string;
  price?: number;
  extras?: Array<{ id: string; name: string; price: number }>;
  removedIngredients?: Array<{
    id: string;
    name: string;
    productId?: string;
    productName?: string;
  }>;
  promotion?: {
    id: string;
    name: string;
    badge?: string | null;
    originalPrice: number;
    discountAmount: number;
    finalPrice: number;
    items: Array<{
      id: string;
      name: string;
      itemType?: "product" | "combo";
      price: number;
    }>;
  };
};

type VariantRow = {
  id: string;
  product_id: string;
  price: number;
  is_default?: boolean;
};

type ComboRow = {
  id: string;
  name: string;
  price: number;
  combo_products?: Array<{
    product_id: string;
    quantity: number;
    products?: {
      product_variants?: VariantRow[];
    } | null;
  }>;
};

type OrderItemInsert = {
  item_type: "product" | "combo" | "promotion";
  product_id: string | null;
  combo_id: string | null;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  extras: Array<{ type: string; name: string; price?: number; id?: string; itemType?: "product" | "combo" }>;
};

const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(...args);
};

function normalizePaymentText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isCustomerAllowedPaymentMethod(method: { name?: string | null; type?: string | null }) {
  const type = normalizePaymentText(method.type);
  const name = normalizePaymentText(method.name);
  return type === "cash" || type === "transfer" || name.includes("efectivo") || name.includes("transferencia");
}

function normalizeArgWhatsapp(input?: string | null) {
  let digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("549") && digits.length >= 12) return digits;
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9") && digits.length === 11) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  return digits.length === 10 ? `549${digits}` : null;
}

async function sendOrderConfirmationWhatsapp({
  supabase,
  tenantId,
  branchId,
  orderId,
  conversationId,
  customerPhone,
  customerName,
  orderText,
  orderTotal,
}: {
  supabase: any;
  tenantId: string;
  branchId: string;
  orderId: string;
  conversationId: string;
  customerPhone: string;
  customerName: string;
  orderText: string;
  orderTotal: number;
}) {
  const targetPhone = normalizeArgWhatsapp(customerPhone);
  if (!targetPhone) {
    return { ok: false, status: 400, error: "invalid_customer_whatsapp_phone" };
  }

  const { data: numberRow, error: numberError } = await supabase
    .from("whatsapp_numbers")
    .select("phone_number_id, access_token")
    .eq("branch_id", branchId)
    .maybeSingle();
  const number = numberRow as { phone_number_id?: string | null; access_token?: string | null } | null;

  if (numberError || !number?.phone_number_id || !number?.access_token) {
    return {
      ok: false,
      status: 400,
      error: numberError?.message || "whatsapp_number_not_configured",
    };
  }

  const components = [
    {
      type: "body",
      parameters: [customerName, orderText, orderTotal.toString()].map((param) => ({
        type: "text",
        text: param || "-",
      })),
    },
    {
      type: "button",
      sub_type: "quick_reply",
      index: "0",
      parameters: [{ type: "payload", payload: "confirmacion_pedido" }],
    },
    {
      type: "button",
      sub_type: "quick_reply",
      index: "1",
      parameters: [{ type: "payload", payload: "cancelar_pedido" }],
    },
  ];

  const response = await fetch(`https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${number.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: targetPhone,
      type: "template",
      template: {
        name: "confirmacion_pedido_detallado",
        language: { code: "es_AR" },
        components,
      },
    }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.error) {
    return {
      ok: false,
      status: response.status,
      error: result?.error?.message || `whatsapp_${response.status}`,
      response: result,
    };
  }

  const messageId = result?.messages?.[0]?.id || null;
  if (messageId) {
    await supabase
      .from("orders")
      .update({ whatsapp_message_id: messageId })
      .eq("id", orderId);
  }

  await supabase.from("messages").insert({
    tenant_id: tenantId,
    branch_id: branchId,
    conversation_id: conversationId,
    sender_type: "cashier",
    message: "confirmacion_pedido_detallado",
    media_type: "template",
    whatsapp_message_id: messageId,
  });

  return { ok: true, status: response.status, messageId };
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json();

    const {
      branchSlug,
      customer,
      items,
      paymentMethodId,
      paymentReference,
      orderMode,
      total,
      shippingCost,
      customerLat,
      customerLng,
      couponCode,
    }: {
      branchSlug: string;
      customer: { name: string; phone: string; address?: string };
      items: OrderItemInput[];
      paymentMethodId?: string;
      paymentReference?: string;
      orderMode?: string;
      total?: number;
      shippingCost?: number;
      customerLat?: number;
      customerLng?: number;
      couponCode?: string | null;
    } = body;

    /* =========================
       VALIDACIONES 🔥
    ========================= */

    if (!customer?.phone) {
      return Response.json({ success: false, error: "Phone required" });
    }

    if (!items || items.length === 0) {
      return Response.json({ success: false, error: "Empty cart" });
    }

    const phoneNormalized = customer.phone
      .replace(/\D/g, "")
      .replace(/^549/, "")
      .replace(/^54/, "")
      .replace(/^9(\d{10})$/, "$1");

    /* =========================
       1. BRANCH
    ========================= */

    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id")
      .eq("slug", branchSlug)
      .single();

    if (!branch) {
      return Response.json({ success: false, error: "Branch not found" });
    }

    if (paymentMethodId) {
      const { data: paymentMethod } = await supabase
        .from("payment_methods")
        .select("id, name, type, requires_reference")
        .eq("id", paymentMethodId)
        .eq("tenant_id", branch.tenant_id)
        .eq("is_active", true)
        .or(`branch_id.eq.${branch.id},branch_id.is.null`)
        .maybeSingle();

      if (!paymentMethod || !isCustomerAllowedPaymentMethod(paymentMethod)) {
        return Response.json({
          success: false,
          error: "Metodo de pago no disponible para pedidos web",
        });
      }

      if (paymentMethod.requires_reference && !String(paymentReference || "").trim()) {
        return Response.json({
          success: false,
          error: "Referencia de pago requerida",
        });
      }
    }

    const [{ data: branchSettings }, { data: branchHours }] = await Promise.all([
      supabase
        .from("branch_settings")
        .select("web_open, web_closed_message, web_closed_reason, web_closed_until")
        .eq("branch_id", branch.id)
        .maybeSingle(),
      supabase
        .from("branch_hours")
        .select("day_of_week, open_time, close_time, is_closed")
        .eq("branch_id", branch.id),
    ]);

    const availability = getBranchAvailability({
      settings: branchSettings,
      hours: branchHours,
    });

    if (!availability.isOpen) {
      return Response.json(
        {
          success: false,
          error: availability.message || "Estamos cerrados por el momento.",
        },
        { status: 409 },
      );
    }

    /* =========================
       2. VARIANTS (🔥 CORE)
    ========================= */

    // Auto-detect combo items by variantId pattern (combo variants end with "-variant")
    const normalizedItems = items.map((item) => {
      const isPromotion = item.itemType === "promotion";
      const isCombo = !isPromotion && (item.itemType === "combo" || item.variantId?.endsWith("-variant"));
      return {
        ...item,
        itemType: isPromotion ? "promotion" : isCombo ? "combo" : "product",
        comboId: item.comboId || (isCombo ? item.variantId?.replace(/-variant$/, "") : undefined),
      };
    });

    const promotionItems = normalizedItems.filter((item) => item.itemType === "promotion");
    const productItems = normalizedItems.filter((item) => item.itemType === "product");
    const comboItems = normalizedItems.filter((item) => item.itemType === "combo");
    const variantIds = productItems.map((i) => i.variantId).filter(Boolean);
    const productIds = productItems
      .map((i) => i.productId)
      .filter((id): id is string => Boolean(id));

    const { data: variants } =
      variantIds.length > 0
        ? await supabase
            .from("product_variants")
            .select("id, product_id, price, is_default")
            .in("id", variantIds)
        : { data: [] as VariantRow[] };

    const { data: variantsByProduct } =
      productIds.length > 0
        ? await supabase
            .from("product_variants")
            .select("id, product_id, price, is_default")
            .in("product_id", productIds)
        : { data: [] as VariantRow[] };

    const comboIds = [
      ...new Set(
        comboItems
          .map((item) => item.comboId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const { data: combos } =
      comboIds.length > 0
        ? await supabase
            .from("combos")
            .select(
              `
              id,
              name,
              price,
              combo_products(
                product_id,
                quantity,
                products(
                  product_variants(id, product_id, price, is_default)
                )
              )
            `,
            )
            .in("id", comboIds)
            .or(`branch_id.eq.${branch.id},tenant_id.eq.${branch.tenant_id}`)
            .eq("is_active", true)
        : { data: [] as ComboRow[] };
    debugLog("VARIANTS:", variants);
    const variantRows = [...(variants || []), ...(variantsByProduct || [])].filter(
      (variant, index, all) =>
        all.findIndex((candidate) => candidate.id === variant.id) === index,
    );

    if (productItems.length > 0 && variantRows.length === 0) {
      return Response.json({ success: false, error: "Invalid products" });
    }

    if (comboItems.length > 0) {
      const foundComboIds = new Set((combos || []).map((combo) => combo.id));
      const missingComboIds = comboIds.filter((comboId) => !foundComboIds.has(comboId));

      if (comboIds.length === 0 || missingComboIds.length > 0) {
        return Response.json({
          success: false,
          error: "Invalid combos",
          details: missingComboIds.length > 0 ? { missingComboIds } : undefined,
        });
      }
    }

    const comboRows = (combos || []) as ComboRow[];

    /* =========================
       3. BUILD ITEMS
    ========================= */

    let subtotal = 0;
    let promotionDiscountAmount = 0;
    const promotionIds: string[] = [];
    const promotionNames: string[] = [];
    const discountBreakdown: Array<Record<string, unknown>> = [];

    const itemsToInsert: OrderItemInsert[] = productItems.map((item) => {
      const variant =
        variantRows.find((v) => v.id === item.variantId) ||
        variantRows.find((v) => v.product_id === item.productId && v.is_default) ||
        variantRows.find((v) => v.product_id === item.productId);

      if (!variant) {
        throw new Error(
          `Variant not found for product ${item.productId || "unknown"} (${item.variantId || "no variant"})`,
        );
      }

      // Build extras array from selected modifiers + removed ingredients
      const extrasArr: Array<{ type: string; name: string; price?: number }> = [];
      (item.extras || []).forEach((e) => extrasArr.push({ type: "extra", name: e.name, price: e.price }));
      (item.removedIngredients || []).forEach((r) =>
        extrasArr.push({
          type: "sin",
          name: r.productName ? `${r.productName}: ${r.name}` : r.name,
        }),
      );

      const itemTotal = variant.price * item.quantity;

      subtotal += itemTotal;

      return {
        item_type: "product",
        product_id: variant.product_id || item.productId,
        combo_id: null,
        variant_id: variant.id,
        quantity: item.quantity,
        unit_price: variant.price,
        total: itemTotal,
        extras: extrasArr,
      };
    });

    comboItems.forEach((item) => {
      const combo = comboRows.find(
        (candidate) => candidate.id === item.comboId,
      );
      if (!combo) throw new Error(`Combo not found: ${item.comboId}`);
      const comboExtrasArr: Array<{ type: string; name: string; price?: number }> = [];
      const comboExtrasTotal = (item.extras || []).reduce((sum, extra) => {
        comboExtrasArr.push({ type: "extra", name: extra.name, price: extra.price });
        return sum + Number(extra.price || 0);
      }, 0);
      (item.removedIngredients || []).forEach((removed) => {
        comboExtrasArr.push({
          type: "sin",
          name: removed.productName
            ? `${removed.productName}: ${removed.name}`
            : removed.name,
        });
      });

      const comboProducts = combo.combo_products || [];
      if (comboProducts.length === 0) {
        throw new Error(`Combo has no products: ${combo.name}`);
      }

      subtotal += (Number(combo.price) + comboExtrasTotal) * item.quantity;

      // Store combo as a single order item with the full combo price
      const comboItemTotal = (Number(combo.price) + comboExtrasTotal) * item.quantity;
      itemsToInsert.push({
        item_type: "combo",
        product_id: null,
        combo_id: combo.id,
        variant_id: null,
        quantity: item.quantity,
        unit_price: Number(combo.price),
        total: comboItemTotal,
        extras: comboExtrasArr.length > 0 ? comboExtrasArr : [],
      });
    });

    promotionItems.forEach((item) => {
      if (!item.promotion) throw new Error(`Promotion metadata missing: ${item.name || item.variantId}`);
      const extrasArr: Array<{ type: string; name: string; price?: number }> = [];
      const extrasTotal = (item.extras || []).reduce((sum, extra) => {
        extrasArr.push({ type: "extra", name: extra.name, price: extra.price });
        return sum + Number(extra.price || 0);
      }, 0);
      const quantity = Number(item.quantity || 1);
      const promoUnitPrice = Number(item.promotion.finalPrice || item.price || 0);
      const promoOriginalPrice = Number(item.promotion.originalPrice || promoUnitPrice);
      const promoDiscount = Number(item.promotion.discountAmount || Math.max(0, promoOriginalPrice - promoUnitPrice));
      const unitPrice = promoUnitPrice + extrasTotal;
      const itemTotal = unitPrice * quantity;

      subtotal += itemTotal;
      promotionDiscountAmount += promoDiscount * quantity;
      promotionIds.push(item.promotion.id);
      promotionNames.push(item.promotion.name);
      discountBreakdown.push({
        promotionId: item.promotion.id,
        promotionName: item.promotion.name,
        badge: item.promotion.badge,
        originalPrice: promoOriginalPrice,
        finalPrice: promoUnitPrice,
        discountAmount: promoDiscount,
        quantity,
        extrasTotal,
        items: item.promotion.items || [],
      });

      itemsToInsert.push({
        item_type: "promotion",
        product_id: null,
        combo_id: null,
        variant_id: null,
        quantity,
        unit_price: unitPrice,
        total: itemTotal,
        extras: [
          { type: "promotion", name: item.promotion.name, price: promoUnitPrice },
          ...((item.promotion.items || []).map((promoItem) => ({
            type: "incluye",
            id: promoItem.id,
            itemType: promoItem.itemType,
            name: promoItem.name,
            price: promoItem.price,
          }))),
          ...extrasArr,
        ],
      });
    });

    const orderTotal = total ?? subtotal;
    const normalizedCouponCode = String(couponCode || "").trim().toUpperCase();
    let appliedCoupon: any = null;
    let couponDiscountAmount = 0;

    if (normalizedCouponCode) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("tenant_id", branch.tenant_id)
        .eq("code", normalizedCouponCode)
        .eq("is_active", true)
        .maybeSingle();

      if (!coupon) {
        return Response.json({
          success: false,
          error: "El cupón ya no está disponible. Quitalo y volvé a confirmar.",
        });
      }

      appliedCoupon = coupon;
      couponDiscountAmount = Math.max(
        0,
        subtotal + Number(shippingCost || 0) - orderTotal,
      );
    }

    const totalDiscountAmount = promotionDiscountAmount + couponDiscountAmount;
    const orderDiscountBreakdown =
      appliedCoupon && couponDiscountAmount > 0
        ? [
            ...discountBreakdown,
            {
              type: "coupon",
              couponId: appliedCoupon.id,
              couponCode: appliedCoupon.code,
              couponName: appliedCoupon.name,
              discountType: appliedCoupon.discount_type,
              discountAmount: couponDiscountAmount,
            },
          ]
        : discountBreakdown;

    /* =========================
       4. CUSTOMER
    ========================= */

    let { data: customerDB } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", branch.tenant_id)
      .eq("phone", phoneNormalized)
      .maybeSingle();

    if (!customerDB) {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          tenant_id: branch.tenant_id,
          name: customer.name || "Cliente",
          phone: phoneNormalized,
          address: customer.address || null,
        })
        .select()
        .single();

      debugLog("CUSTOMER INSERT ERROR:", error);
      debugLog("CUSTOMER INSERT RESULT:", data);

      if (error || !data) {
        // If phone already exists for another tenant, try to find and reuse
        const { data: existingByPhone } = await supabase
          .from("customers")
          .select("*")
          .eq("phone", phoneNormalized)
          .maybeSingle();
        if (existingByPhone) {
          customerDB = existingByPhone;
        } else {
          return Response.json({
            success: false,
            error: `Customer creation failed: ${error?.message || "Unknown error"}`,
          });
        }
      } else {
        customerDB = data;
      }
    } else {
      // Actualizar nombre/dirección si cambió
      const updates: Record<string, string> = {};
      if (customer.name && customer.name !== customerDB.name) updates.name = customer.name;
      if (customer.address && customer.address !== customerDB.address) updates.address = customer.address;
      if (Object.keys(updates).length > 0) {
        await supabase.from("customers").update(updates).eq("id", customerDB.id);
      }
    }

    if (!customerDB) {
      return Response.json({
        success: false,
        error: "No se pudo crear o encontrar el cliente",
      });
    }
    /* =========================
       5. CONVERSATION
    ========================= */

    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("customer_id", customerDB.id)
      .eq("branch_id", branch.id)
      .maybeSingle();

    if (!conversation) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          tenant_id: branch.tenant_id,
          branch_id: branch.id,
          customer_id: customerDB.id,
        })
        .select()
        .single();

      debugLog("CONVERSATION INSERT ERROR:", error);

      conversation = data;
    }

    /* =========================
       6. ORDER
    ========================= */

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        customer_id: customerDB.id,
        sales_channel: "customer",
        status: "unconfirmed",
        type: orderMode === "takeaway" ? "takeaway" : "delivery",

        customer_name: customer.name,
        customer_phone: phoneNormalized,
        address: customer.address,

        subtotal,
        total: orderTotal,
        promotion_ids: promotionIds,
        promotion_names: promotionNames,
        coupon_id: appliedCoupon?.id || null,
        discount_amount: totalDiscountAmount,
        discount_breakdown: orderDiscountBreakdown,
        subtotal_before_discount: subtotal + totalDiscountAmount,
        final_total: orderTotal,

        shipping_cost: shippingCost || 0,
        discount: totalDiscountAmount,
        paid_amount: 0,
        is_paid: false,
      })
      .select()
      .single();
    debugLog("ORDER:", order);
    debugLog("ORDER ERROR:", orderError);
    if (!order) {
      return Response.json({ success: false });
    }

    // Guardar coordenadas si se seleccionó punto en el mapa
    if (customerLat && customerLng) {
      await supabase.from("order_analytics").insert({
        order_id: order.id,
        customer_lat: customerLat,
        customer_lng: customerLng,
      });

      // Detectar zona de delivery
      const { data: zones } = await supabase
        .from("delivery_zones")
        .select("id, coordinates, name")
        .eq("branch_id", branch.id)
        .eq("is_active", true);
      if (zones && zones.length > 0) {
        for (const zone of zones) {
          const pts = zone.coordinates || [];
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i][0], yi = pts[i][1];
            const xj = pts[j][0], yj = pts[j][1];
            if ((yi > customerLng) !== (yj > customerLng) && customerLat < ((xj - xi) * (customerLng - yi)) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) {
            await supabase.from("orders").update({ delivery_zone_id: zone.id }).eq("id", order.id);
            break;
          }
        }
      }
    }
    /* =========================
       7. ORDER ITEMS
    ========================= */

    const { error: itemsError } = await supabase.from("order_items").insert(
      itemsToInsert.map((item) => ({
        ...item,
        order_id: order.id,
      })),
    );

    if (itemsError) {
      await logAppError("customer", "Order items could not be created", {
        tenantId: branch.tenant_id,
        branchId: branch.id,
        code: itemsError.code,
        context: { orderId: order.id, phase: "order_items_insert" },
      });
      await supabase.from("orders").delete().eq("id", order.id);
      return Response.json({
        success: false,
        error: `Order items could not be created: ${itemsError.message}`,
      });
    }

    /* =========================
       7.5 ORDER PAYMENT
    ========================= */

    if (paymentMethodId) {
      const { error: paymentError } = await supabase.from("order_payments").insert({
        order_id: order.id,
        payment_method_id: paymentMethodId,
        amount: orderTotal,
        reference: paymentReference || null,
      });

      if (paymentError) {
        await logAppError("customer", "Order payment could not be created", {
          tenantId: branch.tenant_id,
          branchId: branch.id,
          code: paymentError.code,
          context: { orderId: order.id, phase: "order_payments_insert" },
        });
        await supabase.from("order_items").delete().eq("order_id", order.id);
        await supabase.from("orders").delete().eq("id", order.id);
        return Response.json({
          success: false,
          error: "Order payment could not be created",
        });
      }
    }

    if (appliedCoupon) {
      await supabase.from("coupon_uses").insert({
        coupon_id: appliedCoupon.id,
        order_id: order.id,
        customer_phone: phoneNormalized,
      });

      await supabase
        .from("coupons")
        .update({
          total_uses: Number(appliedCoupon.total_uses || 0) + 1,
        })
        .eq("id", appliedCoupon.id);
    }

    if (discountBreakdown.length > 0) {
      const analyticsRows = discountBreakdown.map((entry) => {
        const items = Array.isArray(entry.items) ? entry.items : [];
        const quantity = Number(entry.quantity || 1);
        return {
          tenant_id: branch.tenant_id,
          promotion_id: entry.promotionId,
          promotion_name: String(entry.promotionName || "Promocion"),
          promotion_type: "visual",
          order_id: order.id,
          customer_id: customerDB.id,
          subtotal_before_discount: Number(entry.originalPrice || 0) * quantity,
          discount_amount: Number(entry.discountAmount || 0) * quantity,
          final_total: Number(entry.finalPrice || 0) * quantity,
          extras_total: Number(entry.extrasTotal || 0) * quantity,
          items_count: items.length * quantity,
        };
      });

      const { error: analyticsError } = await supabase
        .from("promotion_analytics")
        .insert(analyticsRows);

      if (analyticsError) {
        await logAppError("customer", "Promotion analytics could not be saved", {
          tenantId: branch.tenant_id,
          branchId: branch.id,
          code: analyticsError.code,
          context: { orderId: order.id, phase: "promotion_analytics_insert" },
        });
      }

      await Promise.all(discountBreakdown.map(async (entry) => {
        if (!entry.promotionId) return;
        const quantity = Number(entry.quantity || 1);
        const { data: promo } = await supabase
          .from("promotions")
          .select("usage_count, generated_sales, discount_granted")
          .eq("id", entry.promotionId)
          .maybeSingle();

        await supabase
          .from("promotions")
          .update({
            usage_count: Number(promo?.usage_count || 0) + quantity,
            generated_sales: Number(promo?.generated_sales || 0) + Number(entry.finalPrice || 0) * quantity,
            discount_granted: Number(promo?.discount_granted || 0) + Number(entry.discountAmount || 0) * quantity,
          })
          .eq("id", entry.promotionId);
      }));
    }

    /* =========================
        8. WHATSAPP - Confirmación al cliente
    ========================= */

    const orderText = itemsToInsert
      .map((i) => `${i.quantity}x $${i.total}`)
      .join(" • ");

    try {
      const whatsappResult = await sendOrderConfirmationWhatsapp({
        supabase,
        tenantId: branch.tenant_id,
        branchId: branch.id,
        orderId: order.id,
        conversationId: conversation.id,
        customerPhone: phoneNormalized,
        customerName: customer.name || "Cliente",
        orderText,
        orderTotal,
      });

      if (!whatsappResult.ok) {
        await logAppError("customer", "WhatsApp order confirmation could not be sent", {
          tenantId: branch.tenant_id,
          branchId: branch.id,
          code: String(whatsappResult.error || `whatsapp_${whatsappResult.status}`),
          context: {
            orderId: order.id,
            conversationId: conversation.id,
            response: whatsappResult,
          },
        });
      }
    } catch (e) {
      console.error("WhatsApp error:", e);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("ORDER ERROR:", err);
    return Response.json({
      success: false,
      error: err instanceof Error ? err.message : "Order could not be created",
    });
  }
}
