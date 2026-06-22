import { createClient } from "@supabase/supabase-js";

function normalizeArgPhone(input: string) {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  return `549${digits}`;
}

function formatDate(value?: string | null) {
  if (!value) return "fecha a confirmar";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatCurrency(value?: number | string | null) {
  const amount = Number(value || 0);
  if (!amount) return "";
  return `$${new Intl.NumberFormat("es-AR").format(Math.round(amount))}`;
}

function buildReservationCustomerMessage({
  branchName,
  settings,
  customerName,
  partySize,
  reservationDate,
  reservationTime,
  province,
}: {
  branchName: string;
  settings: any;
  customerName: string;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  province?: string;
}) {
  const title = settings.title || "tu reserva";
  const isEvent = settings.reservation_type === "event";
  const lines = [
    `Hola ${customerName.trim()}!`,
    "",
    isEvent
      ? `Tu inscripcion a *${title}* quedo registrada.`
      : `Tu reserva en *${branchName}* quedo registrada.`,
    "",
    `Fecha: ${formatDate(reservationDate)}`,
    settings.no_time ? null : `Horario: ${reservationTime.slice(0, 5)}`,
    isEvent ? null : `Personas: ${partySize}`,
    settings.location_name ? `Lugar: ${settings.location_name}` : null,
    settings.location_address ? `Direccion: ${settings.location_address}` : null,
    province ? `Provincia: ${province}` : null,
    settings.deposit_amount
      ? `Para confirmar, transferi ${formatCurrency(settings.deposit_amount)}.`
      : null,
    settings.deposit_alias ? `Alias: ${settings.deposit_alias}` : null,
    "",
    settings.confirmation_message || "Te vamos a contactar por WhatsApp para confirmar los detalles.",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildReservationBranchMessage({
  branchName,
  settings,
  customerName,
  customerPhone,
  customerEmail,
  partySize,
  reservationDate,
  reservationTime,
  province,
}: {
  branchName: string;
  settings: any;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  province?: string;
}) {
  const title = settings.title || branchName;
  const isEvent = settings.reservation_type === "event";
  const lines = [
    isEvent ? `Nueva inscripcion: *${title}*` : `Nueva reserva: *${branchName}*`,
    "",
    `Cliente: ${customerName.trim()}`,
    `WhatsApp: ${customerPhone}`,
    customerEmail ? `Email: ${customerEmail}` : null,
    `Fecha: ${formatDate(reservationDate)}`,
    settings.no_time ? null : `Horario: ${reservationTime.slice(0, 5)}`,
    isEvent ? null : `Personas: ${partySize}`,
    province ? `Provincia: ${province}` : null,
    settings.deposit_amount ? `Sena: ${formatCurrency(settings.deposit_amount)}` : null,
    settings.deposit_alias ? `Alias: ${settings.deposit_alias}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}

async function sendWhatsapp({
  tenantSlug,
  branchSlug,
  phone,
  message,
}: {
  tenantSlug: string;
  branchSlug: string;
  phone: string;
  message: string;
}) {
  const token = String(
    process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN || "",
  )
    .trim()
    .replace(/^["']|["']$/g, "");
  const baseUrl = String(
    process.env.WHATSAPP_SERVER_URL || "https://whatsapp.mordiscoburgers.com.ar",
  ).replace(/\/$/, "");

  if (!token) {
    return { ok: false, skipped: true, error: "WHATSAPP_TOKEN missing" };
  }

  const whatsappPayload = {
    slug: tenantSlug,
    branchId: branchSlug,
    phone,
    message,
  };

  console.log("[reservations] WhatsApp request", {
    url: `${baseUrl}/api/whatsapp/send`,
    slug: whatsappPayload.slug,
    branchId: whatsappPayload.branchId,
    phone: whatsappPayload.phone,
    tokenConfigured: Boolean(token),
    payload: whatsappPayload,
    messagePreview: whatsappPayload.message.slice(0, 500),
    messageLength: whatsappPayload.message.length,
  });

  try {
    const response = await fetch(`${baseUrl}/api/whatsapp/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(whatsappPayload),
    });

    const payload = await response.json().catch(async () => ({
      text: await response.text().catch(() => ""),
    }));

    console.log("[reservations] WhatsApp response", {
      slug: whatsappPayload.slug,
      branchId: whatsappPayload.branchId,
      phone: whatsappPayload.phone,
      status: response.status,
      ok: response.ok,
      payload,
    });

    return {
      ok: response.ok && !payload?.error,
      status: response.status,
      response: payload,
      error:
        payload?.error || (!response.ok ? `whatsapp_${response.status}` : null),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "whatsapp_send_failed",
    };
  }
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json();
    const {
      branchSlug,
      eventId,
      customerName,
      customerPhone,
      customerEmail,
      partySize,
      reservationDate,
      reservationTime,
      province,
      notes,
    } = body;

    if (!branchSlug || !customerName || !customerPhone || !partySize || !reservationDate) {
      return Response.json({ success: false, error: "Faltan datos obligatorios" }, { status: 400 });
    }

    const normalizedPhone = normalizeArgPhone(customerPhone);
    if (!normalizedPhone) {
      return Response.json({ success: false, error: "WhatsApp invalido" }, { status: 400 });
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id, name, slug, phone")
      .eq("slug", branchSlug)
      .or("active.is.null,active.eq.true")
      .single();

    if (!branch) {
      return Response.json({ success: false, error: "Sucursal no encontrada" }, { status: 404 });
    }

    const eventQuery = eventId
      ? supabase
          .from("reservation_events")
          .select("*")
          .eq("id", eventId)
          .eq("branch_id", branch.id)
          .eq("enabled", true)
          .single()
      : supabase
          .from("reservation_settings")
          .select("*")
          .eq("branch_id", branch.id)
          .eq("enabled", true)
          .single();

    const { data: settings } = await eventQuery;

    if (!settings) {
      return Response.json({ success: false, error: "Reservas no disponibles" }, { status: 404 });
    }

    const finalReservationTime = settings.no_time ? "00:00" : reservationTime;

    if (!finalReservationTime) {
      return Response.json({ success: false, error: "Horario requerido" }, { status: 400 });
    }

    const size = Number(partySize);
    if (size < Number(settings.min_party_size || 1) || size > Number(settings.max_party_size || 20)) {
      return Response.json({ success: false, error: "Cantidad de personas fuera de rango" }, { status: 400 });
    }

    if (settings.capacity_per_slot) {
      const { data: sameSlot } = await supabase
        .from("reservations")
        .select("party_size,status")
        .eq("branch_id", branch.id)
        .match(eventId ? { reservation_event_id: eventId } : {})
        .eq("reservation_date", reservationDate)
        .eq("reservation_time", finalReservationTime)
        .not("status", "in", "(cancelled,no_show)");

      const reservedPeople = (sameSlot || []).reduce(
        (sum, reservation) => sum + Number(reservation.party_size || 0),
        0,
      );

      if (reservedPeople + size > Number(settings.capacity_per_slot)) {
        return Response.json({ success: false, error: "Ese horario ya no tiene cupo" }, { status: 409 });
      }
    }

    const { data: reservation, error } = await supabase
      .from("reservations")
      .insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        reservation_event_id: eventId || null,
        customer_name: customerName.trim(),
        customer_phone: normalizedPhone,
        customer_email: customerEmail?.trim() || null,
        party_size: size,
        reservation_date: reservationDate,
        reservation_time: finalReservationTime,
        notes: notes?.trim() || null,
        status: "pending",
        source: "customer",
        metadata: province ? { province } : {},
      })
      .select("id")
      .single();

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    const [{ data: tenant }, { data: branchSettings }] = await Promise.all([
      supabase
        .from("tenants")
        .select("slug")
        .eq("id", branch.tenant_id)
        .maybeSingle(),
      supabase
        .from("branch_settings")
        .select("catalog_order_whatsapp_phone")
        .eq("branch_id", branch.id)
        .maybeSingle(),
    ]);

    const tenantSlug = tenant?.slug || "";
    const branchReceiverPhone = normalizeArgPhone(
      branchSettings?.catalog_order_whatsapp_phone || branch.phone || "",
    );
    const customerMessage = buildReservationCustomerMessage({
      branchName: branch.name,
      settings,
      customerName,
      partySize: size,
      reservationDate,
      reservationTime: finalReservationTime,
      province,
    });
    const branchMessage = buildReservationBranchMessage({
      branchName: branch.name,
      settings,
      customerName,
      customerPhone: normalizedPhone,
      customerEmail,
      partySize: size,
      reservationDate,
      reservationTime: finalReservationTime,
      province,
    });

    const [customerWhatsapp, branchWhatsapp] = tenantSlug
      ? await Promise.all([
          sendWhatsapp({
            tenantSlug,
            branchSlug: branch.slug,
            phone: normalizedPhone,
            message: customerMessage,
          }),
          branchReceiverPhone
            ? sendWhatsapp({
                tenantSlug,
                branchSlug: branch.slug,
                phone: branchReceiverPhone,
                message: branchMessage,
              })
            : Promise.resolve({
                ok: false,
                skipped: true,
                error: "branch_whatsapp_not_configured",
              }),
        ])
      : [
          { ok: false, skipped: true, error: "tenant_slug_missing" },
          { ok: false, skipped: true, error: "tenant_slug_missing" },
        ];

    return Response.json({
      success: true,
      reservationId: reservation.id,
      customerWhatsappSent: Boolean(customerWhatsapp.ok),
      branchWhatsappSent: Boolean(branchWhatsapp.ok),
      customerWhatsapp,
      branchWhatsapp,
    });
  } catch (error: any) {
    return Response.json(
      { success: false, error: error.message || "No se pudo crear la reserva" },
      { status: 500 },
    );
  }
}
