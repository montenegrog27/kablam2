import { createClient } from "@supabase/supabase-js";

type OrderItemInput = {
  variantId: string;
  quantity: number;
  extras?: Array<{ id: string; name: string; price: number }>;
  removedIngredients?: Array<{ id: string; name: string }>;
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

    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, product_id, price")
      .in(
        "id",
        items.map((i) => i.variantId),
      );
    console.log("🧪 VARIANTS:", variants);
    if (!variants || variants.length === 0) {
      return Response.json({ success: false, error: "Invalid products" });
    }

    /* =========================
       3. BUILD ITEMS
    ========================= */

    let subtotal = 0;

    const itemsToInsert = items.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId);

      if (!variant) {
        throw new Error(`Variant not found: ${item.variantId}`);
      }

      // Build extras array from selected modifiers + removed ingredients
      const extrasArr: Array<{ type: string; name: string; price?: number }> = [];
      (item.extras || []).forEach((e) => extrasArr.push({ type: "extra", name: e.name, price: e.price }));
      (item.removedIngredients || []).forEach((r) => extrasArr.push({ type: "sin", name: r.name }));

      const itemTotal = variant.price * item.quantity;

      subtotal += itemTotal;

      return {
        product_id: variant.product_id,
        variant_id: variant.id,
        quantity: item.quantity,
        unit_price: variant.price,
        total: itemTotal,
        extras: extrasArr,
      };
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

      console.log("💥 CUSTOMER INSERT ERROR:", error);
      console.log("🧪 CUSTOMER INSERT RESULT:", data);

      customerDB = data;
    } else {
      // Actualizar nombre/dirección si cambió
      const updates: any = {};
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

      console.log("💥 CONVERSATION INSERT ERROR:", error);

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
    console.log("🧪 ORDER:", order);
    console.log("💥 ORDER ERROR:", orderError);
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

    await supabase.from("order_items").insert(
      itemsToInsert.map((item) => ({
        ...item,
        order_id: order.id,
      })),
    );

    /* =========================
       7.5 ORDER PAYMENT
    ========================= */

    if (paymentMethodId) {
      await supabase.from("order_payments").insert({
        order_id: order.id,
        payment_method_id: paymentMethodId,
        amount: orderTotal,
        reference: paymentReference || null,
      });
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
    return Response.json({ success: false });
  }
}
