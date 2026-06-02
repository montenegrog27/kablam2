import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(...args);
};

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"];

function isMediaType(type: string) {
  return MEDIA_TYPES.includes(type);
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const body = await req.json();
  const {
    phone,
    message,
    branchId,
    tenantId,
    riderId,
    conversationId,
    type = "text",
    mediaUrl,
    caption,
    fileName,
    templateName,
    params = [],
    contextMessageId,
  } = body;

  if (
    !phone ||
    (type === "text" && !message) ||
    (type === "template" && !templateName) ||
    (isMediaType(type) && !mediaUrl)
  ) {
    return NextResponse.json(
      { error: "phone and message/template/mediaUrl required" },
      { status: 400 },
    );
  }

  const phoneNormalized = phone.replace(/\D/g, "");

  let numberQuery = supabase.from("whatsapp_numbers").select("*");
  if (branchId) numberQuery = numberQuery.eq("branch_id", branchId);
  else if (tenantId) numberQuery = numberQuery.eq("tenant_id", tenantId);

  const { data: number } = await numberQuery.limit(1).single();

  if (!number) {
    return NextResponse.json(
      { error: "whatsapp number not configured" },
      { status: 400 },
    );
  }

  const url = `https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`;
  const components =
    type === "template" && params.length > 0
      ? [
          {
            type: "body",
            parameters: params.map((param: string) => ({
              type: "text",
              text: param || "-",
            })),
          },
        ]
      : [];

  let payload: Record<string, unknown>;

  if (type === "template") {
    payload = {
      messaging_product: "whatsapp",
      to: phoneNormalized,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es_AR" },
        ...(components.length > 0 ? { components } : {}),
      },
      ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
    };
  } else if (isMediaType(type)) {
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
      to: phoneNormalized,
      type,
      [type]: mediaPayload,
      ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
    };
  } else {
    payload = {
      messaging_product: "whatsapp",
      to: phoneNormalized,
      type: "text",
      text: { body: message },
      ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
    };
  }

  debugLog("Sending WhatsApp direct", { type, templateName });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${number.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  debugLog("WhatsApp response:", result);

  if (result.error) {
    console.error("WhatsApp error:", result.error);
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  const messageId = result.messages?.[0]?.id;
  let insertedMessage = null;
  let targetConversationId = conversationId;

  if (!targetConversationId && riderId && branchId && tenantId) {
    const { data: existingConversation } = await supabase
      .from("rider_conversations")
      .select("id")
      .eq("branch_id", branchId)
      .eq("rider_id", riderId)
      .maybeSingle();

    targetConversationId = existingConversation?.id;

    if (!targetConversationId) {
      const { data: newConversation } = await supabase
        .from("rider_conversations")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          rider_id: riderId,
        })
        .select("id")
        .single();
      targetConversationId = newConversation?.id;
    }
  }

  if (targetConversationId && branchId && tenantId) {
    const { data: repliedMessage } = contextMessageId
      ? await supabase
          .from("messages")
          .select("id")
          .eq("whatsapp_message_id", contextMessageId)
          .maybeSingle()
      : { data: null };

    const { data } = await supabase
      .from("messages")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        conversation_id: targetConversationId,
        sender_type: "cashier",
        rider_id: riderId || null,
        message: type === "template" ? templateName : message || caption || fileName || null,
        media_type: type,
        media_url: mediaUrl || null,
        whatsapp_message_id: messageId,
        reply_to_whatsapp_message_id: contextMessageId || null,
        reply_to_message_id: repliedMessage?.id || null,
      })
      .select()
      .single();

    insertedMessage = data;

    await supabase
      .from("rider_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", targetConversationId);
  }

  return NextResponse.json({
    success: true,
    messageId,
    message: insertedMessage,
  });
}
