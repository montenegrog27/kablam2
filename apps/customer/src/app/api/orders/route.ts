import { createClient } from "@supabase/supabase-js";
import { logAppError } from "@/lib/logAppError";
import { getBranchAvailability } from "@/lib/branchAvailability";

type OrderItemInput = {
  itemType?: "product" | "combo";
  productId?: string;
  comboId?: string;
  variantId: string;
  quantity: number;
  extras?: Array<{ id: string; name: string; price: number }>;
  removedIngredients?: Array<{
    id: string;
    name: string;
    productId?: string;
    productName?: string;
  }>;
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
  item_type: "product" | "combo";
  product_id: string | null;
  combo_id: string | null;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  extras: Array<{ type: string; name: string; price?: number }>;
};

const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(...args);
};

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
      const isCombo = item.itemType === "combo" || item.variantId?.endsWith("-variant");
      return {
        ...item,
        itemType: isCombo ? "combo" : "product",
        comboId: item.comboId || (isCombo ? item.variantId?.replace(/-variant$/, "") : undefined),
      };
    });

    const productItems = normalizedItems.filter((item) => item.itemType !== "combo");
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

    const orderTotal = total ?? subtotal;

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

        shipping_cost: shippingCost || 0,
        discount: 0,
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

    /* =========================
        8. WHATSAPP - Confirmación al cliente
    ========================= */

    const orderText = itemsToInsert
      .map((i) => `${i.quantity}x $${i.total}`)
      .join(" • ");

    try {
      const cashierUrl = process.env.NEXT_PUBLIC_CASHIER_APP_URL
        || process.env.NEXT_PUBLIC_APP_URL
        || "";

      if (!cashierUrl) {
        console.error("WhatsApp URL not configured (NEXT_PUBLIC_CASHIER_APP_URL)");
      } else {
        // Check if payment method is transferencia
        let esTransferencia = false;
        if (paymentMethodId) {
          const { data: pm } = await supabase
            .from("payment_methods")
            .select("name")
            .eq("id", paymentMethodId)
            .single();
          if (pm) {
            const name = pm.name.toLowerCase();
            esTransferencia = name.includes("transferencia") || name.includes("alias") || name.includes("cbU") || name.includes("mercadopago") || name.includes("depósito");
          }
        }

        const esDelivery = orderMode === "delivery";

        // Build confirmation message
        let mensajeFinal = "";
        if (esTransferencia) {
          if (esDelivery) {
            mensajeFinal = "✅ Pedido confirmado. Te avisaremos por acá cuando esté yendo el repartidor. ¡Gracias!\nALIAS: 👇👇👇";
          } else {
            mensajeFinal = "✅ Pedido confirmado. Te avisaremos por acá cuando esté listo para retiro. ¡Gracias!\nALIAS: 👇👇👇";
          }
        } else {
          if (esDelivery) {
            mensajeFinal = "✅ Pedido confirmado. Te avisaremos por acá cuando esté yendo el repartidor. ¡Gracias!";
          } else {
            mensajeFinal = "✅ Pedido confirmado. Te avisaremos por acá cuando esté listo para retiro. ¡Gracias!";
          }
        }

        // Send confirmation message
        await fetch(`${cashierUrl}/api/whatsapp/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            orderId: order.id,
            type: "text",
            text: mensajeFinal,
          }),
        });

        // Send template for tracking
        await fetch(`${cashierUrl}/api/whatsapp/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            orderId: order.id,
            type: "template",
            templateName: "confirmacion_pedido_detallado",
            params: [customer.name, orderText, orderTotal.toString()],
          }),
        });

        // For transferencia, send extra alias message
        if (esTransferencia) {
          await fetch(`${cashierUrl}/api/whatsapp/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: conversation.id,
              orderId: order.id,
              type: "text",
              text: "MORDISCO.ARG",
            }),
          });
        }
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
