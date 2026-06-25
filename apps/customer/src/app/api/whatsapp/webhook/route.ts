import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

async function sendText(number: any, to: string, body: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${number.phone_number_id}/messages`,
    {
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
    },
  );

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.error) {
    console.error("Customer WhatsApp webhook send error:", {
      status: response.status,
      error: result?.error || result,
    });
    return { ok: false, status: response.status, result };
  }

  return { ok: true, status: response.status, result };
}

async function getBranchTransferAlias(branchId: string) {
  const { data } = await supabase
    .from("branch_settings")
    .select("catalog_order_transfer_alias")
    .eq("branch_id", branchId)
    .maybeSingle();

  return String(data?.catalog_order_transfer_alias || "").trim() || "MORDISCO.ARG";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const value = body?.entry?.[0]?.changes?.[0]?.value;

  if (!value) return NextResponse.json({ ok: true });

  const status = value?.statuses?.[0];
  if (status) {
    return NextResponse.json({ ok: true });
  }

  const message = value?.messages?.[0];
  if (!message) return NextResponse.json({ ok: true });

  const phoneNumberId = value?.metadata?.phone_number_id;
  const phone = message.from;

  const { data: numbers, error: numberError } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .limit(5);

  const number = numbers?.[0] || null;
  if (!number) {
    console.error("Customer WhatsApp webhook number not configured:", {
      phoneNumberId,
      error: numberError?.message,
      matches: numbers?.length || 0,
    });
    return NextResponse.json({ ok: true });
  }

  const tenantId = number.tenant_id;
  const branchId = number.branch_id;
  const phoneNormalized = normalizeCustomerPhone(phone);

  const isButton =
    (message.type === "interactive" && message.interactive?.type === "button_reply") ||
    message.type === "button";

  if (!isButton) {
    return NextResponse.json({ ok: true });
  }

  const payload = message.interactive?.button_reply?.id || message.button?.payload;
  const buttonTitle = message.interactive?.button_reply?.title || message.button?.text;
  const buttonAction = getButtonAction(payload, buttonTitle);
  const originalMessageId = message.context?.id || null;

  if (!buttonAction) {
    console.error("Customer WhatsApp webhook unknown button:", {
      payload,
      buttonTitle,
      phoneNumberId,
    });
    return NextResponse.json({ ok: true });
  }

  const { data: orderByMessage } = originalMessageId
    ? await supabase
        .from("orders")
        .select("*, order_payments(payment_methods(name))")
        .eq("whatsapp_message_id", originalMessageId)
        .eq("branch_id", branchId)
        .maybeSingle()
    : { data: null };

  const { data: orderByPhone } =
    !orderByMessage && phoneNormalized
      ? await supabase
          .from("orders")
          .select("*, order_payments(payment_methods(name))")
          .eq("customer_phone", phoneNormalized)
          .eq("branch_id", branchId)
          .eq("status", "unconfirmed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  const order = orderByMessage || orderByPhone;
  if (!order) {
    console.error("Customer WhatsApp webhook order not found:", {
      originalMessageId,
      phoneNormalized,
      branchId,
      buttonAction,
    });
    return NextResponse.json({ ok: true });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", order.customer_id)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (buttonAction === "confirm") {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("Customer WhatsApp webhook confirm failed:", updateError);
      return NextResponse.json({ ok: true });
    }

    if (conversation) {
      await supabase.from("messages").insert({
        tenant_id: tenantId,
        branch_id: branchId,
        conversation_id: conversation.id,
        sender_type: "customer",
        message: "El cliente confirmo el pedido",
        media_type: "text",
        whatsapp_message_id: message.id || null,
        reply_to_whatsapp_message_id: originalMessageId,
      });
    }

    const isDelivery = order.type === "delivery";
    const isTransfer = (order.order_payments || []).some((payment: any) => {
      const name = String(payment.payment_methods?.name || "").toLowerCase();
      return (
        name.includes("transferencia") ||
        name.includes("alias") ||
        name.includes("cbu") ||
        name.includes("mercadopago") ||
        name.includes("deposito")
      );
    });

    const messageText = isDelivery
      ? "Pedido confirmado. Te avisaremos cuando salga el repartidor."
      : "Pedido confirmado. Te avisaremos cuando este listo para retirar.";

    await sendText(number, phone, isTransfer ? `${messageText}\nALIAS:` : messageText);
    if (isTransfer) {
      await sendText(number, phone, await getBranchTransferAlias(branchId));
    }
  }

  if (buttonAction === "cancel") {
    const { error: cancelError } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancel_reason: "Cliente cancelo por WhatsApp",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (cancelError) {
      console.error("Customer WhatsApp webhook cancel failed:", cancelError);
      return NextResponse.json({ ok: true });
    }

    if (conversation) {
      await supabase.from("messages").insert({
        tenant_id: tenantId,
        branch_id: branchId,
        conversation_id: conversation.id,
        sender_type: "customer",
        message: "El cliente cancelo el pedido",
        media_type: "text",
        whatsapp_message_id: message.id || null,
        reply_to_whatsapp_message_id: originalMessageId,
      });
    }

    await sendText(number, phone, "Pedido cancelado. Podes hacer otro cuando quieras.");
  }

  return NextResponse.json({ ok: true });
}
