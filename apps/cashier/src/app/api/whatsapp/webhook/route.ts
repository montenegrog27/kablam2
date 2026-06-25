import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(...args);
};

const MEDIA_BUCKETS = ["whatsapp-media", "media", "uploads"];

function extensionFromMime(mimeType: string, fallback = "bin") {
  const clean = mimeType.split(";")[0]?.trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/webm": "webm",
    "application/pdf": "pdf",
  };
  return map[clean] || clean?.split("/")[1] || fallback;
}

function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

async function uploadIncomingMedia(
  bytes: ArrayBuffer,
  contentType: string,
  tenantId: string,
  branchId: string,
  fileName = "media",
) {
  const ext = fileName.includes(".") ? fileName.split(".").pop() : extensionFromMime(contentType);
  const baseName = safeFileName(fileName.replace(/\.[^.]+$/, "") || "media");
  const path = `incoming/${tenantId}/${branchId}/${Date.now()}-${crypto.randomUUID()}-${baseName}.${ext}`;

  for (const bucket of MEDIA_BUCKETS) {
    const { error } = await supabase.storage.from(bucket).upload(path, Buffer.from(bytes), {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });

    if (!error) {
      return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    }

    debugLog("Incoming media upload failed on bucket:", bucket, error.message);
  }

  return null;
}

// ===============================
// HELPERS
// ===============================

async function sendText(number: any, to: string, body: string) {
  const url = `https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`;

  const response = await fetch(url, {
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

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.error) {
    console.error("WhatsApp sendText error:", {
      status: response.status,
      error: result?.error || result,
    });
    return { ok: false, status: response.status, result };
  }

  return { ok: true, status: response.status, result };
}

async function downloadMedia(
  mediaId: string,
  token: string,
  tenantId: string,
  branchId: string,
  fileName = "media",
) {
  try {
    debugLog("downloadMedia: starting for", mediaId);
    const meta = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await meta.json();
    debugLog("downloadMedia: Meta response:", JSON.stringify(data).slice(0, 500));

    if (!data.url) {
      console.error("📥 downloadMedia: no URL from Meta for", mediaId);
      return null;
    }

    debugLog("downloadMedia: downloading from Meta URL");
    const res = await fetch(data.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error("📥 downloadMedia: failed to download from Meta URL", res.status);
      return null;
    }

    const contentType = res.headers.get("content-type") || data.mime_type || "image/jpeg";
    debugLog("downloadMedia: downloaded", { contentType, size: res.headers.get("content-length") });

    const arrayBuffer = await res.arrayBuffer();
    debugLog("downloadMedia: arrayBuffer size:", arrayBuffer.byteLength);

    // Meta media files are persisted in Storage, so the DB keeps only the URL.
    if (arrayBuffer.byteLength > 64 * 1024 * 1024) {
      console.error("📥 downloadMedia: file too large for data URL:", arrayBuffer.byteLength);
      return null;
    }

    const publicUrl = await uploadIncomingMedia(arrayBuffer, contentType, tenantId, branchId, fileName);
    if (!publicUrl) {
      console.error("downloadMedia: could not upload media to storage");
      return null;
    }

    debugLog("downloadMedia: uploaded to storage");
    return publicUrl;
  } catch (err) {
    console.error("📥 downloadMedia error:", err);
    return null;
  }
}

function getButtonAction(payload?: string | null, title?: string | null) {
  const value = `${payload || ""} ${title || ""}`.toLowerCase();
  if (
    value.includes("confirmacion_pedido") ||
    value.includes("confirmar_pedido") ||
    value.includes("confirmar") ||
    value.includes("aceptar")
  ) {
    return "confirm";
  }
  if (
    value.includes("cancelar_pedido") ||
    value.includes("rechazar") ||
    value.includes("cancelar")
  ) {
    return "cancel";
  }
  return null;
}

function normalizeCustomerPhone(input?: string | null) {
  let digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("549")) digits = digits.slice(3);
  else if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9") && digits.length === 11) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  return digits || null;
}

async function getBranchTransferAlias(branchId: string) {
  const { data } = await supabase
    .from("branch_settings")
    .select("catalog_order_transfer_alias")
    .eq("branch_id", branchId)
    .maybeSingle();

  return String(data?.catalog_order_transfer_alias || "").trim() || "MORDISCO.ARG";
}

// ===============================
// VERIFY WEBHOOK
// ===============================

export async function GET(req: Request) {
  const url = new URL(req.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    debugLog("WEBHOOK VERIFIED");
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// ===============================
// MAIN WEBHOOK
// ===============================

export async function POST(req: Request) {
  debugLog("WEBHOOK HIT");

  const body = await req.json();

  debugLog("WEBHOOK BODY RECEIVED");

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value) {
    debugLog("No value in webhook");
    return NextResponse.json({ ok: true });
  }

  // ===============================
  // MESSAGE STATUS UPDATE
  // ===============================

  const status = value?.statuses?.[0];

  if (status) {
    debugLog("STATUS UPDATE:", status.status, status.id);
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

  if (!message) {
    debugLog("No message in webhook value");
    return NextResponse.json({ ok: true });
  }

  debugLog("MESSAGE TYPE:", message.type);
  debugLog("MESSAGE DUMP:", JSON.stringify(message, null, 2));

  const contextMessageId = message.context?.id || null;

  const phoneNumberId = value?.metadata?.phone_number_id;
  const phone = message.from;

  // ===============================
  // GET WHATSAPP NUMBER
  // ===============================

  const { data: numbers, error: numberError } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .limit(5);

  const number = numbers?.[0] || null;

  if (!number) {
    console.error("WhatsApp webhook number not configured:", {
      phoneNumberId,
      error: numberError?.message,
      matches: numbers?.length || 0,
    });
    return NextResponse.json({ ok: true });
  }

  const tenantId = number.tenant_id;
  const branchId = number.branch_id;

  // Normalizar teléfono: quitar código de país 54 si existe
  const phoneNormalized = normalizeCustomerPhone(phone) || phone.replace(/^549/, "54").replace(/^54/, "");
  const phoneWithCountry = phone.startsWith("54") ? phone : `54${phone}`;

  // ===============================
  // BUTTON CLICK (debe ir ANTES que rider)
  // ===============================

  if (
    (message.type === "interactive" && (message as any).interactive?.type === "button_reply") ||
    message.type === "button"
  ) {
    const payload = (message as any).interactive?.button_reply?.id || message.button?.payload;
    const buttonTitle = (message as any).interactive?.button_reply?.title || message.button?.text;
    const buttonAction = getButtonAction(payload, buttonTitle);
    const originalMessageId = message.context?.id;

    debugLog("BUTTON CLICK DETECTED", { payload, buttonTitle, buttonAction, originalMessageId, messageType: message.type });

    if (!buttonAction) {
      debugLog("Unknown button payload, ignoring");
      return NextResponse.json({ ok: true });
    }

    const { data: order } = originalMessageId
      ? await supabase
          .from("orders")
          .select("*, order_payments(payment_methods(name))")
          .eq("whatsapp_message_id", originalMessageId)
          .eq("branch_id", branchId)
          .maybeSingle()
      : { data: null };

    // Fallback: buscar por teléfono y estado unconfirmed
    const orderByPhone = !order ? await supabase
      .from("orders")
      .select("*, order_payments(payment_methods(name))")
      .eq("customer_phone", phoneNormalized)
      .eq("branch_id", branchId)
      .eq("status", "unconfirmed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null };

    const matchedOrder = order || orderByPhone?.data;

    debugLog("ORDER LOOKUP:", {
      originalMessageId,
      byMessageId: !!order,
      byPhone: !!orderByPhone?.data,
      orderFound: !!matchedOrder,
      orderStatus: matchedOrder?.status,
    });

    if (!matchedOrder) {
      debugLog("No order found for message ID or phone");
      return NextResponse.json({ ok: true });
    }

    // Buscar la conversación para guardar mensaje
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", matchedOrder.customer_id)
      .eq("branch_id", branchId)
      .maybeSingle();

    // CONFIRM ORDER

    if (buttonAction === "confirm") {
      debugLog("CONFIRMING ORDER:", matchedOrder.id);
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", matchedOrder.id);

      if (updateError) console.error("❌ Error updating order:", updateError);
      else {
        debugLog("Order confirmed successfully:", matchedOrder.id);
        const { error: loyaltyError } = await supabase.rpc("process_loyalty_for_order", {
          p_order_id: matchedOrder.id,
        });
        if (loyaltyError && loyaltyError.code !== "42883") {
          console.error("Loyalty processing error:", loyaltyError);
        }
      }

      // Guardar mensaje en el chat: "✅ El cliente confirmó el pedido"
      if (conv) {
        await supabase.from("messages").insert({
          tenant_id: tenantId,
          branch_id: branchId,
          conversation_id: conv.id,
          sender_type: "customer",
          message: "✅ El cliente confirmó el pedido",
          media_type: "text",
        });
      }

      const esDelivery = matchedOrder.type === "delivery";
      const esTransfer = (matchedOrder.order_payments || []).some((payment: any) => {
        const name = payment.payment_methods?.name?.toLowerCase() || "";
        return (
          name.includes("transferencia") ||
          name.includes("alias") ||
          name.includes("cbu") ||
          name.includes("mercadopago") ||
          name.includes("depósito") ||
          name.includes("deposito")
        );
      });

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
        await sendText(number, phone, await getBranchTransferAlias(branchId));
      }
    }

    // CANCEL ORDER

    if (buttonAction === "cancel") {
      debugLog("CANCELLING ORDER:", matchedOrder.id);
      const { error: cancelError } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          cancel_reason: "Cliente cancelo por WhatsApp",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", matchedOrder.id);

      if (cancelError) console.error("❌ Error cancelling order:", cancelError);
      else debugLog("Order cancelled successfully:", matchedOrder.id);

      // Guardar mensaje en el chat
      if (conv) {
        await supabase.from("messages").insert({
          tenant_id: tenantId,
          branch_id: branchId,
          conversation_id: conv.id,
          sender_type: "customer",
          message: "❌ El cliente canceló el pedido",
          media_type: "text",
        });
      }

      await sendText(
        number,
        phone,
        "❌ Pedido cancelado. Podés hacer otro cuando quieras.",
      );
    }

    return NextResponse.json({ ok: true });
  } else if (message.type === "interactive") {
    debugLog("Interactive message but not button_reply:", JSON.stringify((message as any).interactive));
  }

  // ===============================
  // CHECK IF IT'S A RIDER
  // ===============================

  let { data: rider } = await supabase
    .from("riders")
    .select("*")
    .eq("tenant_id", tenantId)
    .or(
      `phone.eq.${phoneNormalized},phone.eq.${phoneWithCountry},phone.eq.${phone}`,
    )
    .limit(1)
    .maybeSingle();

  debugLog("Rider lookup:", { phone, riderId: rider?.id });

  // ===============================
  // IF RIDER - HANDLE RIDER CONVERSATION
  // ===============================

  if (rider) {
    // Solo tratar como rider si ya tiene una conversación de rider activa
    // Si no, pasa como cliente (el rider puede ser cliente también)
    const { data: existingRiderConv } = await supabase
      .from("rider_conversations")
      .select("*")
      .eq("rider_id", rider.id)
      .eq("branch_id", branchId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const riderConv = existingRiderConv || (await supabase
      .from("rider_conversations")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        rider_id: rider.id,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single()).data;

    if (riderConv) {
      // Parse message
      let text = null;
      let mediaType = "text";
      let mediaUrl = null;

      if (message.text) text = message.text.body;
  if (message.image) {
    mediaType = "image";
    mediaUrl = await downloadMedia(message.image.id, number.access_token, tenantId, branchId, "image");
  }

  if (message.video) {
    mediaType = "video";
    mediaUrl = await downloadMedia(message.video.id, number.access_token, tenantId, branchId, "video");
  }

  if (message.document) {
    mediaType = "document";
    mediaUrl = await downloadMedia(
      message.document.id,
      number.access_token,
      tenantId,
      branchId,
      message.document.filename || "document",
    );
  }

  if (message.audio) {
    mediaType = "audio";
    mediaUrl = await downloadMedia(message.audio.id, number.access_token, tenantId, branchId, "audio");
  }

  if (message.sticker) {
    mediaType = "sticker";
    mediaUrl = await downloadMedia(message.sticker.id, number.access_token, tenantId, branchId, "sticker");
  }

  if (message.location) {
    const { latitude, longitude } = message.location;
    text = `📍 https://maps.google.com/?q=${latitude},${longitude}`;
    mediaType = "location"
  }

  if (message.contacts) {
    const contact = message.contacts[0];
    const name = contact.name?.formatted_name || contact.name?.first_name || "Contacto";
    const phones = contact.phones?.map((p: any) => p.phone).join(", ") || "";
    text = `👤 ${name}\n📞 ${phones}`;
    mediaType = "contacts";
  }

      // Save message
      const { data: repliedMessage } = contextMessageId
        ? await supabase
            .from("messages")
            .select("id")
            .eq("whatsapp_message_id", contextMessageId)
            .maybeSingle()
        : { data: null };

      const riderMessagePayload = {
        tenant_id: tenantId,
        branch_id: branchId,
        conversation_id: riderConv.id,
        sender_type: "rider",
        rider_id: rider.id,
        message: text,
        media_type: mediaType,
        media_url: mediaUrl,
        whatsapp_message_id: message.id || null,
        reply_to_whatsapp_message_id: contextMessageId,
        reply_to_message_id: repliedMessage?.id || null,
      };

      const { error: riderMessageError } = await supabase
        .from("messages")
        .insert(riderMessagePayload);

      if (riderMessageError) {
        console.error("Error saving rider message:", riderMessageError);
        return NextResponse.json({ ok: true });
      }

      // Update conversation
      await supabase
        .from("rider_conversations")
        .update({ last_message_at: new Date() })
        .eq("id", riderConv.id);

      debugLog("RIDER MESSAGE SAVED");
      return NextResponse.json({ ok: true });
    }

    // No tiene conversación de rider activa → tratar como cliente
    debugLog("Rider found but no active conversation, treating as customer");
  }

  // ===============================
  // IF NOT RIDER - HANDLE CUSTOMER
  // ===============================

  let { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("tenant_id", tenantId)
    .or(
      `phone.eq.${phoneNormalized},phone.eq.${phoneWithCountry},phone.eq.${phone}`,
    )
    .limit(1)
    .maybeSingle();

  debugLog("Phone lookup:", {
    phone,
    phoneNormalized,
    phoneWithCountry,
    customer,
  });

  if (!customer) {
    const profileName = value?.contacts?.[0]?.profile?.name || null;

    const { data, error: insertError } = await supabase
      .from("customers")
      .insert({
        tenant_id: tenantId,
        phone: phoneNormalized,
        name: profileName,
      })
      .select()
      .single();

    if (insertError || !data) {
      console.error("⚠️ Error creating customer:", insertError || "no data returned");
      return NextResponse.json({ ok: true });
    }

    customer = data;
  } else {
    // Actualizar nombre si viene del perfil de WhatsApp y no tenía nombre
    const profileName = value?.contacts?.[0]?.profile?.name;
    if (profileName && !customer.name) {
      await supabase.from("customers").update({ name: profileName }).eq("id", customer.id);
      customer.name = profileName;
    }
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
    const { data, error: conversationError } = await supabase
      .from("conversations")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        customer_id: customer.id,
      })
      .select()
      .single();

    if (conversationError || !data) {
      console.error("Error creating customer conversation:", conversationError || "no data returned");
      return NextResponse.json({ ok: true });
    }

    conversation = data;
  }

  // ===============================
  // MESSAGE PARSING
  // ===============================

  let text: any = null;
  let mediaType = "text";
  let mediaUrl = null;

  if (message.text) {
    text = message.text.body;
  }

  if (message.image) {
    mediaType = "image";
    mediaUrl = await downloadMedia(message.image.id, number.access_token, tenantId, branchId, "image");
  }

  if (message.video) {
    mediaType = "video";
    mediaUrl = await downloadMedia(message.video.id, number.access_token, tenantId, branchId, "video");
  }

  if (message.document) {
    mediaType = "document";
    mediaUrl = await downloadMedia(
      message.document.id,
      number.access_token,
      tenantId,
      branchId,
      message.document.filename || "document",
    );
  }

  if (message.audio) {
    mediaType = "audio";
    mediaUrl = await downloadMedia(message.audio.id, number.access_token, tenantId, branchId, "audio");
  }

  if (message.sticker) {
    mediaType = "sticker";
    mediaUrl = await downloadMedia(message.sticker.id, number.access_token, tenantId, branchId, "sticker");
  }

  if (message.location) {
    const { latitude, longitude } = message.location;
    text = `📍 https://maps.google.com/?q=${latitude},${longitude}`;
    mediaType = "location";
  }

  if (message.contacts) {
    const contact = message.contacts[0];
    const name = contact.name?.formatted_name || contact.name?.first_name || "Contacto";
    const phones = contact.phones?.map((p: any) => p.phone).join(", ") || "";
    text = `👤 ${name}\n📞 ${phones}`;
    mediaType = "contacts";
  }

  // ===============================
  // SAVE MESSAGE
  // ===============================

  const { data: repliedMessage } = contextMessageId
    ? await supabase
        .from("messages")
        .select("id")
        .eq("whatsapp_message_id", contextMessageId)
        .maybeSingle()
    : { data: null };

  const { data: inserted, error: messageInsertError } = await supabase
    .from("messages")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      conversation_id: conversation.id,
      sender_type: "customer",
      message: text,
      media_type: mediaType,
      media_url: mediaUrl,
      whatsapp_message_id: message.id || null,
      reply_to_whatsapp_message_id: contextMessageId,
      reply_to_message_id: repliedMessage?.id || null,
      created_at: new Date(),
    })
    .select()
    .single();

  if (messageInsertError || !inserted) {
    console.error("Error saving customer message:", messageInsertError || "no data returned");
    return NextResponse.json({ ok: true });
  }

  // ===============================
  // REALTIME BROADCAST
  // ===============================

  await supabase.channel(`chat-${conversation.id}`).send({
    type: "broadcast",
    event: "new_message",
    payload: inserted,
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

  debugLog("MESSAGE SAVED");

  return NextResponse.json({ ok: true });
}
