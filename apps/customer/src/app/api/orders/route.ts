import { supabase } from "@kablam/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      branchSlug,
      name,
      phone,
      address,
      items,
      total,
    } = body;

    /* =========================
       1. OBTENER BRANCH
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
       2. CUSTOMER
    ========================= */

    let { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", branch.tenant_id)
      .eq("phone", phone)
      .maybeSingle();

    if (!customer) {
      const { data } = await supabase
        .from("customers")
        .insert({
          tenant_id: branch.tenant_id,
          branch_id: branch.id,
          name,
          phone,
        })
        .select()
        .single();

      customer = data;
    }

    /* =========================
       3. CONVERSATION
    ========================= */

    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("customer_id", customer.id)
      .maybeSingle();

    if (!conversation) {
      const { data } = await supabase
        .from("conversations")
        .insert({
          tenant_id: branch.tenant_id,
          branch_id: branch.id,
          customer_id: customer.id,
        })
        .select()
        .single();

      conversation = data;
    }

    /* =========================
       4. ORDER
    ========================= */

    const { data: order } = await supabase
      .from("orders")
      .insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        customer_id: customer.id,
        customer_name: name,
        customer_phone: phone,
        address,
        total,
        status: "pending",
      })
      .select()
      .single();

    /* =========================
       5. ITEMS
    ========================= */

    await supabase.from("order_items").insert(
      items.map((item: any) => ({
        order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.price,
        total: item.price * item.quantity,
      }))
    );

    /* =========================
       6. TEXTO WHATSAPP
    ========================= */

    const orderText = items
      .map(
        (item: any) =>
          `${item.quantity}x ${item.name} $${item.price * item.quantity}`
      )
      .join(" • ");

    /* =========================
       7. ENVIAR WHATSAPP
    ========================= */

    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId: conversation.id,
        orderId: order.id,
        type: "template",
        templateName: "confirmacion_pedido_detallado",
        params: [name, orderText, total.toString()],
      }),
    });

    return Response.json({ success: true });

  } catch (err) {
    console.error(err);
    return Response.json({ success: false });
  }
}