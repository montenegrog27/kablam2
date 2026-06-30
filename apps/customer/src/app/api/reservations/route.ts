import { createClient } from "@supabase/supabase-js";

const EVENT_DASHBOARD_ACCESS_PASSWORD = "clave123";
const EVENT_DASHBOARD_PAID_PASSWORD = "pagado27";
const EVENT_DASHBOARD_DELETE_PASSWORD = "eliminar27";

type EventDashboardAction = "list" | "toggle_paid" | "delete";

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

function resolveTimeMode(settings: any): "interval" | "single" | "none" {
  if (["interval", "single", "none"].includes(settings?.time_mode)) {
    return settings.time_mode;
  }
  return settings?.no_time ? "none" : "interval";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function eventDashboardUnauthorized(message = "Clave invalida") {
  return Response.json({ success: false, error: message }, { status: 401 });
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
  const includes = Array.isArray(settings.event_includes)
    ? settings.event_includes.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : [];

  if (isEvent) {
    const location = [settings.location_name, settings.location_address]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ");
    const value = formatCurrency(settings.deposit_amount);
    const distance = String(settings.event_badge || "").trim();
    const subtitle = String(settings.event_subtitle || "").trim();
    const eventLines = [
      `*${String(title).toUpperCase()}* 🇦🇷`,
      "",
      `Hola ${customerName.trim()}! Tu inscripción quedó registrada.`,
      "",
      `📅 *Fecha:* ${formatDate(reservationDate)}`,
      resolveTimeMode(settings) === "none" ? null : `🕒 *Horario:* ${reservationTime.slice(0, 5)}`,
      location ? `📍 *Largada y llegada:* ${location}` : null,
      distance ? `🏃‍♀️ *Distancia:* ${distance}` : null,
      value ? `💵 *Valor:* ${value}` : null,
      "",
      settings.deposit_alias
        ? `Para confirmar tu lugar, transferí al alias:\n👉 *${settings.deposit_alias}*`
        : "Te vamos a contactar por WhatsApp para confirmar tu lugar.",
      settings.deposit_alias
        ? "\nDespués respondé este WhatsApp con el screenshot del comprobante de pago."
        : null,
      includes.length ? "\nIncluye:" : null,
      ...includes.map((item: string) => item),
      subtitle ? `\n${subtitle}` : null,
    ];

    return eventLines.filter(Boolean).join("\n");
  }

  const lines = [
    `Hola ${customerName.trim()}!`,
    "",
    `Tu reserva en *${branchName}* quedo registrada.`,
    "",
    `Fecha: ${formatDate(reservationDate)}`,
    resolveTimeMode(settings) === "none" ? null : `Horario: ${reservationTime.slice(0, 5)}`,
    isEvent ? null : `Personas: ${partySize}`,
    settings.location_name ? `Lugar: ${settings.location_name}` : null,
    settings.location_address ? `Direccion: ${settings.location_address}` : null,
    province ? `Provincia: ${province}` : null,
    settings.deposit_amount
      ? `Para confirmar, transferi ${formatCurrency(settings.deposit_amount)}.`
      : null,
    settings.deposit_alias ? `Alias: ${settings.deposit_alias}` : null,
    "",
    settings.confirmation_message || "",
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
    customerPhone ? `WhatsApp: ${customerPhone}` : null,
    customerEmail ? `Email: ${customerEmail}` : null,
    `Fecha: ${formatDate(reservationDate)}`,
    resolveTimeMode(settings) === "none" ? null : `Horario: ${reservationTime.slice(0, 5)}`,
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

async function handleEventDashboardAction(
  supabase: any,
  body: any,
  action: EventDashboardAction,
) {
  const branchSlug = String(body.branchSlug || "").trim();
  const eventId = String(body.eventId || "").trim();
  const password = String(body.password || "");
  const actionPassword = String(body.actionPassword || "");
  const reservationId = String(body.reservationId || "").trim();

  if (!branchSlug || !eventId) {
    return Response.json({ success: false, error: "Faltan datos" }, { status: 400 });
  }

  if (password !== EVENT_DASHBOARD_ACCESS_PASSWORD) {
    return eventDashboardUnauthorized();
  }

  const { data: branchRow } = await supabase
    .from("branches")
    .select("id,tenant_id,slug")
    .eq("slug", branchSlug)
    .or("active.is.null,active.eq.true")
    .single();

  const branch = branchRow as any;

  if (!branch) {
    return Response.json({ success: false, error: "Sucursal no encontrada" }, { status: 404 });
  }

  const eventQuery = supabase
    .from("reservation_events")
    .select("id,tenant_id,branch_id")
    .eq("branch_id", branch.id)
    .eq("enabled", true);

  const { data: eventRow } = await (isUuid(eventId) ? eventQuery.eq("id", eventId) : eventQuery.eq("slug", eventId)).maybeSingle();
  const event = eventRow as any;

  if (!event) {
    return Response.json({ success: false, error: "Evento no encontrado" }, { status: 404 });
  }

  if (action === "list") {
    const { data, error } = await supabase
      .from("reservations")
      .select("id,customer_name,customer_phone,customer_email,party_size,reservation_date,reservation_time,notes,status,metadata,created_at")
      .eq("tenant_id", branch.tenant_id)
      .eq("branch_id", branch.id)
      .eq("reservation_event_id", event.id)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, reservations: data || [] });
  }

  if (!reservationId) {
    return Response.json({ success: false, error: "Falta la inscripcion" }, { status: 400 });
  }

  const { data: reservationRow, error: reservationError } = await supabase
    .from("reservations")
    .select("id,tenant_id,branch_id,reservation_event_id,metadata")
    .eq("id", reservationId)
    .eq("tenant_id", branch.tenant_id)
    .eq("branch_id", branch.id)
    .eq("reservation_event_id", event.id)
    .single();

  const reservation = reservationRow as any;

  if (reservationError || !reservation) {
    return Response.json({ success: false, error: "Inscripcion no encontrada" }, { status: 404 });
  }

  if (action === "toggle_paid") {
    if (actionPassword !== EVENT_DASHBOARD_PAID_PASSWORD) {
      return eventDashboardUnauthorized("Clave de pago invalida");
    }

    const paid = Boolean(body.paid);
    const nextMetadata = {
      ...((reservation.metadata as Record<string, any> | null) || {}),
      event_dashboard_paid: paid,
      event_dashboard_paid_at: paid ? new Date().toISOString() : null,
    };

    const { data: updated, error } = await supabase
      .from("reservations")
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq("id", reservation.id)
      .select("id,customer_name,customer_phone,customer_email,party_size,reservation_date,reservation_time,notes,status,metadata,created_at")
      .single();

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, reservation: updated });
  }

  if (action === "delete") {
    if (actionPassword !== EVENT_DASHBOARD_DELETE_PASSWORD) {
      return eventDashboardUnauthorized("Clave de eliminacion invalida");
    }

    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", reservation.id);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  }

  return Response.json({ success: false, error: "Accion no soportada" }, { status: 400 });
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json();
    const dashboardAction = String(body.action || "") as EventDashboardAction;

    if (["list", "toggle_paid", "delete"].includes(dashboardAction)) {
      return handleEventDashboardAction(supabase, body, dashboardAction);
    }

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

    if (!branchSlug || !partySize || !reservationDate) {
      return Response.json({ success: false, error: "Faltan datos obligatorios" }, { status: 400 });
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

    const showPhone = settings.show_customer_phone !== false;
    const requirePhone = showPhone && settings.require_customer_phone !== false;
    const showEmail = settings.show_customer_email !== false;
    const requireEmail = showEmail && settings.require_customer_email === true;
    const showNotes = settings.show_customer_notes !== false;
    const requireNotes = showNotes && settings.require_customer_notes === true;
    const requireName = settings.require_customer_name !== false;
    const finalCustomerName = String(customerName || "").trim() || "Cliente";
    const normalizedPhone = customerPhone ? normalizeArgPhone(customerPhone) : null;
    const cleanEmail = showEmail ? String(customerEmail || "").trim() : "";
    const cleanNotes = showNotes ? String(notes || "").trim() : "";

    if (requireName && !String(customerName || "").trim()) {
      return Response.json({ success: false, error: "Nombre requerido" }, { status: 400 });
    }

    if (requirePhone && !normalizedPhone) {
      return Response.json({ success: false, error: "WhatsApp invalido" }, { status: 400 });
    }

    if (showPhone && customerPhone && !normalizedPhone) {
      return Response.json({ success: false, error: "WhatsApp invalido" }, { status: 400 });
    }

    if (requireEmail && !cleanEmail) {
      return Response.json({ success: false, error: "Email requerido" }, { status: 400 });
    }

    if (requireNotes && !cleanNotes) {
      return Response.json({ success: false, error: "Nota requerida" }, { status: 400 });
    }

    const timeMode = resolveTimeMode(settings);
    const finalReservationTime = timeMode === "none" ? "00:00" : reservationTime;

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
        customer_name: finalCustomerName,
        customer_phone: normalizedPhone || "",
        customer_email: cleanEmail || null,
        party_size: size,
        reservation_date: reservationDate,
        reservation_time: finalReservationTime,
        notes: cleanNotes || null,
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
      customerName: finalCustomerName,
      partySize: size,
      reservationDate,
      reservationTime: finalReservationTime,
      province,
    });
    const branchMessage = buildReservationBranchMessage({
      branchName: branch.name,
      settings,
      customerName: finalCustomerName,
      customerPhone: normalizedPhone || "",
      customerEmail: cleanEmail,
      partySize: size,
      reservationDate,
      reservationTime: finalReservationTime,
      province,
    });

    const [customerWhatsapp, branchWhatsapp] = tenantSlug
      ? await Promise.all([
          normalizedPhone
            ? sendWhatsapp({
                tenantSlug,
                branchSlug: branch.slug,
                phone: normalizedPhone,
                message: customerMessage,
              })
            : Promise.resolve({
                ok: false,
                skipped: true,
                error: "customer_whatsapp_not_provided",
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
