// import { NextResponse } from "next/server";
// import { createClient } from "@supabase/supabase-js";

// const supabase = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL!,
//   process.env.SUPABASE_SERVICE_ROLE_KEY!
// )

// export async function POST(req: Request) {

//   const body = await req.json();
// console.log("WEBHOOK RECEIVED")

// console.log(JSON.stringify(body, null, 2))
//   const entry = body.entry?.[0];
//   const change = entry?.changes?.[0];
//   const value = change?.value;

//   const phoneNumberId = value?.metadata?.phone_number_id;
//   const message = value?.messages?.[0];

//   if (!message) return NextResponse.json({ ok: true });

//   const phone = message.from;

//   let text = null;
//   let mediaType = "text";
//   let mediaUrl = null;

//   if (message.text) {
//     text = message.text.body;
//   }

//   if (message.image) {
//     mediaType = "image";
//     mediaUrl = message.image.id;
//   }

//   if (message.document) {
//     mediaType = "document";
//     mediaUrl = message.document.id;
//   }

//   if (message.audio) {
//     mediaType = "audio";
//   }

//   // buscar número

//   const { data: number } = await supabase
//     .from("whatsapp_numbers")
//     .select("*")
//     .eq("phone_number_id", phoneNumberId)
//     .maybeSingle();

//   if (!number) return NextResponse.json({ ok: true });

//   const tenantId = number.tenant_id;
//   const branchId = number.branch_id;

//   // buscar customer

//   let { data: customer } = await supabase
//     .from("customers")
//     .select("*")
//     .eq("tenant_id", tenantId)
//     .eq("phone", phone)
//     .maybeSingle();

//   if (!customer) {

//     const { data } = await supabase
//       .from("customers")
//       .insert({
//         tenant_id: tenantId,
//         branch_id: branchId,
//         phone: phone
//       })
//       .select()
//       .single();

//     customer = data;

//   }

//   // conversación

//   let { data: conversation } = await supabase
//     .from("conversations")
//     .select("*")
//     .eq("customer_id", customer.id)
//     .maybeSingle();

//   if (!conversation) {

//     const { data } = await supabase
//       .from("conversations")
//       .insert({
//         tenant_id: tenantId,
//         branch_id: branchId,
//         customer_id: customer.id
//       })
//       .select()
//       .single();

//     conversation = data;

//   }

//   // guardar mensaje

//   await supabase.from("messages").insert({

//     tenant_id: tenantId,
//     branch_id: branchId,
//     conversation_id: conversation.id,

//     sender_type: "customer",

//     message: text,
//     media_type: mediaType,
//     media_url: mediaUrl

//   });

//   return NextResponse.json({ ok: true });

// }

// export async function GET(req: Request) {
//   const url = new URL(req.url);

//   const mode = url.searchParams.get("hub.mode");
//   const token = url.searchParams.get("hub.verify_token");
//   const challenge = url.searchParams.get("hub.challenge");

//   if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
//     return new Response(challenge, { status: 200 });
//   }

//   return new Response("Forbidden", { status: 403 });
// }


  import { NextResponse } from "next/server";
  import { createClient } from "@supabase/supabase-js";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );


  // ===============================
  // GET → verificación de Meta
  // ===============================

  export async function GET(req: Request) {

    const url = new URL(req.url);

    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (
      mode === "subscribe" &&
      token === process.env.WHATSAPP_VERIFY_TOKEN
    ) {
      console.log("✅ WEBHOOK VERIFIED");
      return new Response(challenge, { status: 200 });
    }

    return new Response("Forbidden", { status: 403 });
  }


  // ===============================
  // POST → eventos WhatsApp
  // ===============================

  export async function POST(req: Request) {

    console.log("🔥 WEBHOOK HIT");

    const body = await req.json();

    console.log("WEBHOOK BODY:", JSON.stringify(body, null, 2));

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) {
      return NextResponse.json({ ok: true });
    }


    // ===============================
    // STATUS UPDATE (sent/delivered/read)
    // ===============================

    const status = value?.statuses?.[0];

    if (status) {

      console.log("STATUS UPDATE:", status);

      await supabase
        .from("messages")
        .update({
          status: status.status
        })
        .eq("whatsapp_message_id", status.id);

      return NextResponse.json({ ok: true });
    }


    

    // ===============================
    // MENSAJE ENTRANTE
    // ===============================

    const message = value?.messages?.[0];

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const phoneNumberId = value?.metadata?.phone_number_id;
    const phone = message.from;

    let text = null;
    let mediaType = "text";
    let mediaUrl = null;

    if (message.text) {
      text = message.text.body;
    }

    if (message.image) {
      mediaType = "image";
      mediaUrl = message.image.id;
    }

    if (message.document) {
      mediaType = "document";
      mediaUrl = message.document.id;
    }

    if (message.audio) {
      mediaType = "audio";
    }
  if (message.type === "button") {

    const payload = message.button?.payload;
    const originalMessageId = message.context?.id;

    console.log("BUTTON CLICK:", payload);
    console.log("MESSAGE CONTEXT:", originalMessageId);

    if (!originalMessageId) {
      return NextResponse.json({ ok: true });
    }

    // buscar pedido por messageId

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("whatsapp_message_id", originalMessageId)
      .maybeSingle();

    if (!order) {
      console.log("ORDER NOT FOUND FOR MESSAGE");
      return NextResponse.json({ ok: true });
    }

    // =========================
    // CONFIRMAR PEDIDO
    // =========================

    if (payload === "confirmar_pedido") {

      await supabase
        .from("orders")
        .update({
          status: "confirmed"
        })
        .eq("id", order.id);

      console.log("ORDER CONFIRMED:", order.id);

    }

    // =========================
    // CANCELAR PEDIDO
    // =========================

    if (payload === "cancelar_pedido") {

      await supabase
        .from("orders")
        .update({
          status: "cancelled"
        })
        .eq("id", order.id);

      console.log("ORDER CANCELLED:", order.id);

    }

    return NextResponse.json({ ok: true });

  }
    // ===============================
    // BUSCAR NÚMERO WHATSAPP
    // ===============================

    const { data: number } = await supabase
      .from("whatsapp_numbers")
      .select("*")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();

    if (!number) {
      console.log("⚠️ Número WhatsApp no configurado");
      return NextResponse.json({ ok: true });
    }

    const tenantId = number.tenant_id;
    const branchId = number.branch_id;


    // ===============================
    // BUSCAR / CREAR CUSTOMER
    // ===============================

    let { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .maybeSingle();

    if (!customer) {

      const { data } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          phone: phone
        })
        .select()
        .single();

      customer = data;
    }


    // ===============================
    // BUSCAR / CREAR CONVERSACIÓN
    // ===============================

    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("branch_id", branchId)
      .maybeSingle();

    if (!conversation) {

      const { data } = await supabase
        .from("conversations")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customer.id
        })
        .select()
        .single();

      conversation = data;
    }


// ===============================
// GUARDAR MENSAJE
// ===============================

const { data: inserted } = await supabase
  .from("messages")
  .insert({
    tenant_id: tenantId,
    branch_id: branchId,
    conversation_id: conversation.id,
    sender_type: "customer",
    message: text,
    media_type: mediaType,
    media_url: mediaUrl,
    created_at: new Date()
  })
  .select()
  .single();

// ===============================
// EMITIR EVENTO REALTIME
// ===============================

await supabase
  .channel(`chat-${conversation.id}`)
  .send({
    type: "broadcast",
    event: "new_message",
    payload: inserted
  });
    // ===============================
    // ACTUALIZAR CONVERSACIÓN
    // ===============================

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date()
      })
      .eq("id", conversation.id);


    console.log("✅ MESSAGE SAVED");

    return NextResponse.json({ ok: true });
  }