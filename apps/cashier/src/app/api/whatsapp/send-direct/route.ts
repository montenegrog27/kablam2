import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const body = await req.json();
  const { phone, message } = body;

  if (!phone || !message) {
    return NextResponse.json({ error: "phone and message required" });
  }

  // Normalizar teléfono
  const phoneNormalized = phone.replace(/\D/g, "");

  // Buscar número de WhatsApp configurado (usamos el primero disponible)
  const { data: number } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .limit(1)
    .single();

  if (!number) {
    return NextResponse.json({ error: "whatsapp number not configured" });
  }

  const url = `https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`;

  console.log("📱 Sending WhatsApp to rider:", phoneNormalized);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${number.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phoneNormalized,
      type: "text",
      text: { body: message },
    }),
  });

  const result = await res.json();
  console.log("📱 WhatsApp response:", result);

  if (result.error) {
    console.error("WhatsApp error:", result.error);
    return NextResponse.json({ error: result.error.message });
  }

  return NextResponse.json({
    success: true,
    messageId: result.messages?.[0]?.id,
  });
}
