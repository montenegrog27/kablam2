import { createClient } from "@supabase/supabase-js";
import { logAppError } from "@/lib/logAppError";

type OrderItemInput = {
  itemType?: "product" | "combo";
  productId?: string;
  comboId?: string;
  variantId: string;
  quantity: number;
  extras?: Array<{ id: string; name: string; price: number }>;
  removedIngredients?: Array<{ id: string; name: string }>;
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

    /* =========================
       2. VARIANTS (🔥 CORE)
    ========================= */

    const productItems = items.filter((item) => item.itemType !== "combo");
    const comboItems = items.filter((item) => item.itemType === "combo");
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

    const comboIds = comboItems
      .map((item) => item.comboId)
      .filter((id): id is string => Boolean(id));

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
            .eq("branch_id", branch.id)
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

    if (comboItems.length > 0 && (!combos || combos.length !== comboIds.length)) {
      return Response.json({ success: false, error: "Invalid combos" });
    }

    const comboRows = (combos || []) as ComboRow[];

    /* =========================
       3. BUILD ITEMS
    ========================= */

    let subtotal = 0;

    const itemsToInsert = productItems.map((item) => {
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
      (item.removedIngredients || []).forEach((r) => extrasArr.push({ type: "sin", name: r.name }));

      const itemTotal = variant.price * item.quantity;

      subtotal += itemTotal;

      return {
        product_id: variant.product_id || item.productId,
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

      const comboProducts = combo.combo_products || [];
      if (comboProducts.length === 0) {
        throw new Error(`Combo has no products: ${combo.name}`);
      }

      const expandedUnits = comboProducts.reduce(
        (sum, comboProduct) => sum + (comboProduct.quantity || 1),
        0,
      );
      const unitShare =
        expandedUnits > 0 ? Number(combo.price) / expandedUnits : 0;

      subtotal += Number(combo.price) * item.quantity;

      comboProducts.forEach((comboProduct) => {
        const defaultVariant =
          comboProduct.products?.product_variants?.find(
            (variant) => variant.is_default,
          ) || comboProduct.products?.product_variants?.[0];

        if (!defaultVariant) {
          throw new Error(`Combo product has no variant: ${combo.name}`);
        }

        const quantity = (comboProduct.quantity || 1) * item.quantity;

        itemsToInsert.push({
          product_id: comboProduct.product_id,
          variant_id: defaultVariant.id,
          quantity,
          unit_price: Math.round(unitShare),
          total: Math.round(unitShare * quantity),
          extras: [{ type: "extra", name: `Combo: ${combo.name}`, price: 0 }],
        });
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
          name: customer.name,
          phone: phoneNormalized,
          address: customer.address || null,
        })
        .select()
        .single();

      debugLog("CUSTOMER INSERT ERROR:", error);
      debugLog("CUSTOMER INSERT RESULT:", data);

      customerDB = data;
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
        error: "Customer creation failed",
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
       8. WHATSAPP
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
        await fetch(`${cashierUrl}/api/whatsapp/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversationId: conversation.id,
            orderId: order.id,
            type: "template",
            templateName: "confirmacion_pedido_detallado",
            params: [customer.name, orderText, orderTotal.toString()],
          }),
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
