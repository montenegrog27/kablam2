import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {

  const body = await req.json();

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  const phoneNumberId = value?.metadata?.phone_number_id;
  const message = value?.messages?.[0];

  if (!message) return NextResponse.json({ ok: true });

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

  // buscar número

  const { data: number } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (!number) return NextResponse.json({ ok: true });

  const tenantId = number.tenant_id;
  const branchId = number.branch_id;

  // buscar customer

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

  // conversación

  let { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("customer_id", customer.id)
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

  // guardar mensaje

  await supabase.from("messages").insert({

    tenant_id: tenantId,
    branch_id: branchId,
    conversation_id: conversation.id,

    sender_type: "customer",

    message: text,
    media_type: mediaType,
    media_url: mediaUrl

  });

  return NextResponse.json({ ok: true });

}