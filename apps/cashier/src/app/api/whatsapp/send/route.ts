// import { createClient } from "@supabase/supabase-js";
// import { NextResponse } from "next/server";

// export async function POST(req: Request) {

//   const supabase = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL!,
//   process.env.SUPABASE_SERVICE_ROLE_KEY!
// )

//   const body = await req.json();

//   const { conversationId, text } = body;

//   // 1️⃣ buscar conversación

//   const { data: conversation } = await supabase
//     .from("conversations")
//     .select("*")
//     .eq("id", conversationId)
//     .single();

//   if (!conversation) {
//     return NextResponse.json({ error: "conversation not found" });
//   }

//   // 2️⃣ buscar customer

//   const { data: customer } = await supabase
//     .from("customers")
//     .select("*")
//     .eq("id", conversation.customer_id)
//     .single();

//   if (!customer) {
//     return NextResponse.json({ error: "customer not found" });
//   }

//   // 3️⃣ buscar número whatsapp

//   const { data: number } = await supabase
//     .from("whatsapp_numbers")
//     .select("*")
//     .eq("branch_id", conversation.branch_id)
//     .single();

//   if (!number) {
//     return NextResponse.json({ error: "whatsapp number not configured" });
//   }

//   // 4️⃣ enviar mensaje

// console.log("SEND WHATSAPP START")

// console.log("conversationId:", conversationId)
// console.log("text:", text)

// console.log("customer:", customer)
// console.log("number:", number)

// const url =
//   `https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`;

// console.log("META URL:", url)

// const res = await fetch(url, {
//   method: "POST",
//   headers: {
//     Authorization: `Bearer ${number.access_token}`,
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({
//     messaging_product: "whatsapp",
//     to: customer.phone,
//     type: "text",
//     text: { body: text }
//   }),
// });

// const result = await res.json();

// console.log("META RESPONSE:", result)

//   if (result.error) {
//     console.error(result.error);
//     return NextResponse.json({ error: result.error.message });
//   }

//   // 5️⃣ guardar mensaje

//   await supabase.from("messages").insert({
//     tenant_id: conversation.tenant_id,
//     branch_id: conversation.branch_id,
//     conversation_id: conversation.id,
//     sender_type: "cashier",
//     message: text,
//     media_type: "text"
//   });

//   return NextResponse.json({ success: true });

// }


import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();

const {
  conversationId,
  orderId,
  type = "text",
  text,
  templateName,
  params = []
} = body;

  // =============================
  // buscar conversación
  // =============================

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "conversation not found" });
  }

  // =============================
  // buscar customer
  // =============================

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", conversation.customer_id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "customer not found" });
  }

  // =============================
  // buscar número whatsapp
  // =============================

  const { data: number } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .eq("branch_id", conversation.branch_id)
    .single();

  if (!number) {
    return NextResponse.json({ error: "whatsapp number not configured" });
  }

  const url =
    `https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`;

  let payload;

  // =============================
  // TEXT MESSAGE
  // =============================

  if (type === "text") {

    payload = {
      messaging_product: "whatsapp",
      to: customer.phone,
      type: "text",
      text: { body: text }
    };

  }

  // =============================
  // TEMPLATE MESSAGE
  // =============================

  if (type === "template") {

    payload = {
      messaging_product: "whatsapp",
      to: customer.phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es_AR" },
    components: [
  {
    type: "body",
    parameters: params.map((p: string) => ({
      type: "text",
      text: p
    }))
  },
  {
    type: "button",
    sub_type: "quick_reply",
    index: "0",
    parameters: [
      {
        type: "payload",
        payload: "confirmar_pedido"
      }
    ]
  },
  {
    type: "button",
    sub_type: "quick_reply",
    index: "1",
    parameters: [
      {
        type: "payload",
        payload: "cancelar_pedido"
      }
    ]
  }
]
      }
    };

  }

  console.log("SEND WHATSAPP START");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${number.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  console.log("META RESPONSE:", result);

  if (result.error) {
    console.error(result.error);
    return NextResponse.json({ error: result.error.message });
  }

  const messageId = result.messages?.[0]?.id;
// =============================
// guardar messageId en order
// =============================

if (orderId && messageId) {
  console.log("📝 SAVING whatsapp_message_id on order:", { orderId, messageId });

  await supabase
    .from("orders")
    .update({
      whatsapp_message_id: messageId
    })
    .eq("id", orderId);

  console.log("✅ whatsapp_message_id saved on order");
}
  console.log("ORDER ID RECEIVED:", orderId);
  // =============================
  // guardar mensaje
  // =============================

  await supabase.from("messages").insert({
    tenant_id: conversation.tenant_id,
    branch_id: conversation.branch_id,
    conversation_id: conversation.id,
    sender_type: "cashier",
    message: text || templateName,
    media_type: type,
    whatsapp_message_id: messageId
  });

  return NextResponse.json({ success: true });

}