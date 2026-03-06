import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {

  const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

  const body = await req.json();

  const { conversationId, text } = body;

  // 1️⃣ buscar conversación

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "conversation not found" });
  }

  // 2️⃣ buscar customer

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", conversation.customer_id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "customer not found" });
  }

  // 3️⃣ buscar número whatsapp

  const { data: number } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .eq("branch_id", conversation.branch_id)
    .single();

  if (!number) {
    return NextResponse.json({ error: "whatsapp number not configured" });
  }

  // 4️⃣ enviar mensaje

console.log("SEND WHATSAPP START")

console.log("conversationId:", conversationId)
console.log("text:", text)

console.log("customer:", customer)
console.log("number:", number)

const url =
  `https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`;

console.log("META URL:", url)

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${number.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: customer.phone,
    type: "text",
    text: { body: text }
  }),
});

const result = await res.json();

console.log("META RESPONSE:", result)

  if (result.error) {
    console.error(result.error);
    return NextResponse.json({ error: result.error.message });
  }

  // 5️⃣ guardar mensaje

  await supabase.from("messages").insert({
    tenant_id: conversation.tenant_id,
    branch_id: conversation.branch_id,
    conversation_id: conversation.id,
    sender_type: "cashier",
    message: text,
    media_type: "text"
  });

  return NextResponse.json({ success: true });

}