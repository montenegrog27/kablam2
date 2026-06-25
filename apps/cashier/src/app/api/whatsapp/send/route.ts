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

const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(...args);
};

type WhatsAppMediaType = "image" | "video" | "audio" | "document" | "sticker";

function isMediaType(type: string): type is WhatsAppMediaType {
  return ["image", "video", "audio", "document", "sticker"].includes(type);
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
  mediaUrl,
  caption,
  fileName,
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

  const targetPhone = normalizeArgWhatsapp(customer.phone);
  if (!targetPhone) {
    return NextResponse.json({ error: "invalid customer whatsapp phone" }, { status: 400 });
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
      to: targetPhone,
      type: "text",
      text: { body: text }
    };

  }

  // =============================
  // MEDIA MESSAGE
  // =============================

  if (isMediaType(type)) {
    if (!mediaUrl) {
      return NextResponse.json(
        { error: "mediaUrl is required for media messages" },
        { status: 400 },
      );
    }

    const mediaPayload =
      type === "document"
        ? {
            link: mediaUrl,
            filename: fileName || "archivo",
            ...(caption ? { caption } : {}),
          }
        : type === "audio" || type === "sticker"
          ? { link: mediaUrl }
          : {
              link: mediaUrl,
              ...(caption ? { caption } : {}),
            };

    payload = {
      messaging_product: "whatsapp",
      to: targetPhone,
      type,
      [type]: mediaPayload,
    };
  }

  // =============================
  // TEMPLATE MESSAGE
  // =============================

  if (type === "template") {

    const hasParams = params && params.length > 0;
    const hasButtons = ["confirmacion_pedido", "confirmacion_pedido_detallado"].includes(templateName);

    const components: any[] = [];

    if (hasParams) {
      components.push({
        type: "body",
        parameters: params.map((p: string) => ({
          type: "text",
          text: p,
        })),
      });
    }

    if (hasButtons) {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: "0",
        parameters: [
          {
            type: "payload",
            payload: "confirmacion_pedido",
          },
        ],
      });
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: "1",
        parameters: [
          {
            type: "payload",
            payload: "cancelar_pedido",
          },
        ],
      });
    }

    payload = {
      messaging_product: "whatsapp",
      to: targetPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es_AR" },
        ...(components.length > 0 ? { components } : {}),
      },
    };

  }

  debugLog("SEND WHATSAPP START");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${number.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  debugLog("META RESPONSE:", result);

  if (result.error) {
    console.error(result.error);
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  const messageId = result.messages?.[0]?.id;
// =============================
// guardar messageId en order
// =============================

if (orderId && messageId) {
  debugLog("SAVING whatsapp_message_id on order:", { orderId, messageId });

  await supabase
    .from("orders")
    .update({
      whatsapp_message_id: messageId
    })
    .eq("id", orderId);

  debugLog("whatsapp_message_id saved on order");
}
  debugLog("ORDER ID RECEIVED:", orderId);
  // =============================
  // guardar mensaje
  // =============================

  const { data: insertedMessage, error: insertError } = await supabase.from("messages").insert({
    tenant_id: conversation.tenant_id,
    branch_id: conversation.branch_id,
    conversation_id: conversation.id,
    sender_type: "cashier",
    message: text || caption || templateName || null,
    media_type: type,
    media_url: mediaUrl || null,
    whatsapp_message_id: messageId
  }).select().single();

  if (insertError) {
    console.error(insertError);
    return NextResponse.json({ error: "message could not be saved" }, { status: 500 });
  }

  return NextResponse.json({ success: true, messageId, message: insertedMessage });

}
