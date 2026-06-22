import { createClient } from "@supabase/supabase-js";

function normalizeArgPhone(input: string) {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  return `549${digits}`;
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
      .select("id, tenant_id, name")
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

    /*
    WhatsApp automatico pendiente:
    await fetch(process.env.WHATSAPP_RESERVATIONS_ENDPOINT!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: branch.id,
        phone: normalizedPhone,
        message: buildReservationMessage(settings, {
          customerName,
          partySize: size,
          reservationDate,
          reservationTime,
        }),
      }),
    });
    */

    return Response.json({ success: true, reservationId: reservation.id });
  } catch (error: any) {
    return Response.json(
      { success: false, error: error.message || "No se pudo crear la reserva" },
      { status: 500 },
    );
  }
}
