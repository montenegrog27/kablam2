//   import { NextResponse } from "next/server";
//   import { createClient } from "@supabase/supabase-js";

//   const supabase = createClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.SUPABASE_SERVICE_ROLE_KEY!
//   );


//   // ===============================
//   // GET → verificación de Meta
//   // ===============================

//   export async function GET(req: Request) {

//     const url = new URL(req.url);

//     const mode = url.searchParams.get("hub.mode");
//     const token = url.searchParams.get("hub.verify_token");
//     const challenge = url.searchParams.get("hub.challenge");

//     if (
//       mode === "subscribe" &&
//       token === process.env.WHATSAPP_VERIFY_TOKEN
//     ) {
//       console.log("✅ WEBHOOK VERIFIED");
//       return new Response(challenge, { status: 200 });
//     }

//     return new Response("Forbidden", { status: 403 });
//   }


//   // ===============================
//   // POST → eventos WhatsApp
//   // ===============================

//   export async function POST(req: Request) {

//     console.log("🔥 WEBHOOK HIT");

//     const body = await req.json();

//     console.log("WEBHOOK BODY:", JSON.stringify(body, null, 2));

//     const entry = body.entry?.[0];
//     const change = entry?.changes?.[0];
//     const value = change?.value;

//     if (!value) {
//       return NextResponse.json({ ok: true });
//     }


//     // ===============================
//     // STATUS UPDATE (sent/delivered/read)
//     // ===============================

//     const status = value?.statuses?.[0];

//     if (status) {

//       console.log("STATUS UPDATE:", status);

//       await supabase
//         .from("messages")
//         .update({
//           status: status.status
//         })
//         .eq("whatsapp_message_id", status.id);

//       return NextResponse.json({ ok: true });
//     }


    

//     // ===============================
//     // MENSAJE ENTRANTE
//     // ===============================

//     const message = value?.messages?.[0];

//     if (!message) {
//       return NextResponse.json({ ok: true });
//     }

//     const phoneNumberId = value?.metadata?.phone_number_id;
//     const phone = message.from;

//     let text = null;
//     let mediaType = "text";
//     let mediaUrl = null;

//     if (message.text) {
//       text = message.text.body;
//     }

//     if (message.image) {
//       mediaType = "image";
//       mediaUrl = message.image.id;
//     }

//     if (message.document) {
//       mediaType = "document";
//       mediaUrl = message.document.id;
//     }

//     if (message.audio) {
//       mediaType = "audio";
//     }
//   if (message.type === "button") {

//     const payload = message.button?.payload;
//     const originalMessageId = message.context?.id;

//     console.log("BUTTON CLICK:", payload);
//     console.log("MESSAGE CONTEXT:", originalMessageId);

//     if (!originalMessageId) {
//       return NextResponse.json({ ok: true });
//     }

//     // buscar pedido por messageId

//     const { data: order } = await supabase
//       .from("orders")
//       .select("*")
//       .eq("whatsapp_message_id", originalMessageId)
//       .maybeSingle();

//     if (!order) {
//       console.log("ORDER NOT FOUND FOR MESSAGE");
//       return NextResponse.json({ ok: true });
//     }

//     // =========================
//     // CONFIRMAR PEDIDO
//     // =========================

//     if (payload === "confirmar_pedido") {

//       await supabase
//         .from("orders")
//         .update({
//           status: "confirmed"
//         })
//         .eq("id", order.id);

//       console.log("ORDER CONFIRMED:", order.id);

//     }

//     // =========================
//     // CANCELAR PEDIDO
//     // =========================

//     if (payload === "cancelar_pedido") {

//       await supabase
//         .from("orders")
//         .update({
//           status: "cancelled"
//         })
//         .eq("id", order.id);

//       console.log("ORDER CANCELLED:", order.id);

//     }

//     return NextResponse.json({ ok: true });

//   }
//     // ===============================
//     // BUSCAR NÚMERO WHATSAPP
//     // ===============================

//     const { data: number } = await supabase
//       .from("whatsapp_numbers")
//       .select("*")
//       .eq("phone_number_id", phoneNumberId)
//       .maybeSingle();

//     if (!number) {
//       console.log("⚠️ Número WhatsApp no configurado");
//       return NextResponse.json({ ok: true });
//     }

//     const tenantId = number.tenant_id;
//     const branchId = number.branch_id;


//     // ===============================
//     // BUSCAR / CREAR CUSTOMER
//     // ===============================

//     let { data: customer } = await supabase
//       .from("customers")
//       .select("*")
//       .eq("tenant_id", tenantId)
//       .eq("phone", phone)
//       .maybeSingle();

//     if (!customer) {

//       const { data } = await supabase
//         .from("customers")
//         .insert({
//           tenant_id: tenantId,
//           branch_id: branchId,
//           phone: phone
//         })
//         .select()
//         .single();

//       customer = data;
//     }


//     // ===============================
//     // BUSCAR / CREAR CONVERSACIÓN
//     // ===============================

//     let { data: conversation } = await supabase
//       .from("conversations")
//       .select("*")
//       .eq("customer_id", customer.id)
//       .eq("branch_id", branchId)
//       .maybeSingle();

//     if (!conversation) {

//       const { data } = await supabase
//         .from("conversations")
//         .insert({
//           tenant_id: tenantId,
//           branch_id: branchId,
//           customer_id: customer.id
//         })
//         .select()
//         .single();

//       conversation = data;
//     }


// // ===============================
// // GUARDAR MENSAJE
// // ===============================

// const { data: inserted } = await supabase
//   .from("messages")
//   .insert({
//     tenant_id: tenantId,
//     branch_id: branchId,
//     conversation_id: conversation.id,
//     sender_type: "customer",
//     message: text,
//     media_type: mediaType,
//     media_url: mediaUrl,
//     created_at: new Date()
//   })
//   .select()
//   .single();

// // ===============================
// // EMITIR EVENTO REALTIME
// // ===============================

// await supabase
//   .channel(`chat-${conversation.id}`)
//   .send({
//     type: "broadcast",
//     event: "new_message",
//     payload: inserted
//   });
//     // ===============================
//     // ACTUALIZAR CONVERSACIÓN
//     // ===============================

//     await supabase
//       .from("conversations")
//       .update({
//         last_message_at: new Date()
//       })
//       .eq("id", conversation.id);


//     console.log("✅ MESSAGE SAVED");

//     return NextResponse.json({ ok: true });
//   }



import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);



// ===============================
// HELPERS
// ===============================

async function sendText(number:any, to:string, body:string) {

  const url = `https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${number.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

}


async function downloadMedia(mediaId:string, token:string) {

  const meta = await fetch(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await meta.json();

  return data.url;

}


// ===============================
// VERIFY WEBHOOK
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
// MAIN WEBHOOK
// ===============================

export async function POST(req: Request) {

  console.log("🔥 WEBHOOK HIT");

  const body = await req.json();

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value) return NextResponse.json({ ok: true });



  // ===============================
  // MESSAGE STATUS UPDATE
  // ===============================

  const status = value?.statuses?.[0];

  if (status) {

    await supabase
      .from("messages")
      .update({ status: status.status })
      .eq("whatsapp_message_id", status.id);

    return NextResponse.json({ ok: true });

  }



  // ===============================
  // INCOMING MESSAGE
  // ===============================

  const message = value?.messages?.[0];

  if (!message) return NextResponse.json({ ok: true });

  const phoneNumberId = value?.metadata?.phone_number_id;
  const phone = message.from;



  // ===============================
  // GET WHATSAPP NUMBER
  // ===============================

  const { data: number } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (!number) {
    console.log("⚠️ whatsapp number not configured");
    return NextResponse.json({ ok: true });
  }

  const tenantId = number.tenant_id;
  const branchId = number.branch_id;



  // ===============================
  // GET OR CREATE CUSTOMER
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
        phone,
      })
      .select()
      .single();

    customer = data;

  }



  // ===============================
  // GET OR CREATE CONVERSATION
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
        customer_id: customer.id,
      })
      .select()
      .single();

    conversation = data;

  }



  // ===============================
  // BUTTON CLICK
  // ===============================

  if (message.type === "button") {

    const payload = message.button?.payload;
    const originalMessageId = message.context?.id;

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("whatsapp_message_id", originalMessageId)
      .maybeSingle();

    if (!order) return NextResponse.json({ ok: true });



    // CONFIRM ORDER

    if (payload === "confirmar_pedido") {

      await supabase
        .from("orders")
        .update({ status: "confirmed" })
        .eq("id", order.id);

      const esDelivery = order.type === "delivery";
      const esTransfer = order.payment_method === "transfer";

      let msg = "";

      if (esTransfer) {

        msg = esDelivery
          ? "✅ Pedido confirmado. Te avisaremos cuando salga el repartidor.\nALIAS 👇"
          : "✅ Pedido confirmado. Te avisaremos cuando esté listo para retirar.\nALIAS 👇";

      } else {

        msg = esDelivery
          ? "✅ Pedido confirmado. Te avisaremos cuando salga el repartidor."
          : "✅ Pedido confirmado. Te avisaremos cuando esté listo para retirar.";

      }

      await sendText(number, phone, msg);

      if (esTransfer) {
        await sendText(number, phone, "MORDISCO.ARG");
      }

    }



    // CANCEL ORDER

    if (payload === "cancelar_pedido") {

      await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", order.id);

      await sendText(
        number,
        phone,
        "❌ Pedido cancelado. Podés hacer otro cuando quieras."
      );

    }

    return NextResponse.json({ ok: true });

  }



  // ===============================
  // MESSAGE PARSING
  // ===============================

  let text:any = null;
  let mediaType = "text";
  let mediaUrl = null;

  if (message.text) {
    text = message.text.body;
  }

  if (message.image) {

    mediaType = "image";

    mediaUrl = await downloadMedia(
      message.image.id,
      number.access_token
    );

  }

  if (message.document) {

    mediaType = "document";

    mediaUrl = await downloadMedia(
      message.document.id,
      number.access_token
    );

  }

  if (message.audio) {

    mediaType = "audio";

    mediaUrl = await downloadMedia(
      message.audio.id,
      number.access_token
    );

  }

  if (message.location) {

    const { latitude, longitude } = message.location;

    text = `📍 https://maps.google.com/?q=${latitude},${longitude}`;
    mediaType = "location";

  }



  // ===============================
  // SAVE MESSAGE
  // ===============================

  await supabase
    .from("messages")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      conversation_id: conversation.id,
      sender_type: "customer",
      message: text,
      media_type: mediaType,
      media_url: mediaUrl,
    });



  // ===============================
  // UPDATE CONVERSATION
  // ===============================

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date(),
    })
    .eq("id", conversation.id);



  console.log("✅ MESSAGE SAVED");

  return NextResponse.json({ ok: true });

}

