import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const DEFAULT_LOTS = [
  { lot_key: "lote_1", name: "Lote 1", base_price: 20000, capacity: 0, position: 1, is_active: true },
  { lot_key: "lote_2", name: "Lote 2", base_price: 25000, capacity: 0, position: 2, is_active: true },
  { lot_key: "lote_3", name: "Lote 3", base_price: 30000, capacity: 0, position: 3, is_active: true },
];

const DEFAULT_SETTINGS = {
  eventDate: "6 de junio",
  eventTime: "20hs",
  eventLocation: "Terraza Vera - San Juan 635",
  paymentAlias: "mordisco.arg",
  paymentDeadlineMinutes: 60,
  generalMinOrders: 0,
  communityMinOrders: 4,
  founderMinOrders: 0,
  founderTopPercent: 10,
  generalDiscount: 0,
  communityDiscount: 25,
  founderDiscount: 50,
  messages: {
    general: [
      "Hola {name}. Esta puede ser tu primera noche siendo parte de Mordisco.",
      "Invitado especial al primer aniversario. Bienvenido a esta historia.",
      "Tu lugar en el cumple de Mordisco esta esperando.",
    ],
    community: [
      "Hola {name}. Encontramos {orderCount} pedidos realizados con este numero. Gracias por ser parte de Mordisco.",
      "Mordedor desde hace {months} meses. Gracias por acompanarnos desde casi el comienzo.",
      "Cliente desde {year}. Estuviste antes de que Mordisco cumpliera su primer ano.",
      "{orderCount} pedidos realizados. Definitivamente sabemos quien ama las hamburguesas.",
      "Tus pedidos ayudaron a construir este primer ano. Gracias por ser parte.",
    ],
    founder: [
      "Sos parte del Top {topPercent}% de clientes mas frecuentes.",
      "No sos un invitado cualquiera. Sos parte de la historia de Mordisco.",
      "Fundador Mordisco: tus pedidos ayudaron a construir este primer ano.",
      "A vos, que venis desde {year}, gracias por estar antes del primer cumple.",
    ],
  },
};

function normalizeSettings(row: Record<string, unknown> | null | undefined) {
  if (!row) return DEFAULT_SETTINGS;
  return {
    eventDate: row.event_date || DEFAULT_SETTINGS.eventDate,
    eventTime: row.event_time || DEFAULT_SETTINGS.eventTime,
    eventLocation: row.event_location || DEFAULT_SETTINGS.eventLocation,
    paymentAlias: row.payment_alias || DEFAULT_SETTINGS.paymentAlias,
    paymentDeadlineMinutes: Number(row.payment_deadline_minutes || DEFAULT_SETTINGS.paymentDeadlineMinutes),
    generalMinOrders: Number(row.general_min_orders ?? DEFAULT_SETTINGS.generalMinOrders),
    communityMinOrders: Number(row.community_min_orders ?? DEFAULT_SETTINGS.communityMinOrders),
    founderMinOrders: Number(row.founder_min_orders ?? DEFAULT_SETTINGS.founderMinOrders),
    founderTopPercent: Number(row.founder_top_percent ?? DEFAULT_SETTINGS.founderTopPercent),
    generalDiscount: Number(row.general_discount ?? DEFAULT_SETTINGS.generalDiscount),
    communityDiscount: Number(row.community_discount ?? DEFAULT_SETTINGS.communityDiscount),
    founderDiscount: Number(row.founder_discount ?? DEFAULT_SETTINGS.founderDiscount),
    messages: {
      ...DEFAULT_SETTINGS.messages,
      ...(typeof row.tier_messages === "object" && row.tier_messages ? row.tier_messages : {}),
    },
  };
}

async function getUserTenant(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: authData } = await authClient.auth.getUser(token);
  if (!authData.user) return null;

  const service = createServiceClient();
  const { data: userRecord } = await service
    .from("users")
    .select("tenant_id")
    .eq("id", authData.user.id)
    .single();

  return userRecord?.tenant_id || null;
}

export async function GET(req: NextRequest) {
  const tenantId = await getUserTenant(req);
  if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const service = createServiceClient();
  const [{ data, error }, { data: lots, error: lotsError }, { data: settings, error: settingsError }] = await Promise.all([
    service
      .from("anniversary_invitations")
      .select("*, branches(name, slug)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1000),
    service
      .from("anniversary_lots")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("position", { ascending: true }),
    service
      .from("anniversary_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("branch_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron leer los inscriptos", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    invitations: data || [],
    lots: lotsError || !lots || lots.length === 0 ? DEFAULT_LOTS : lots,
    settings: settingsError ? DEFAULT_SETTINGS : normalizeSettings(settings),
    lotsError: lotsError?.message || null,
    settingsError: settingsError?.message || null,
  });
}

export async function PATCH(req: NextRequest) {
  const tenantId = await getUserTenant(req);
  if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const lots = Array.isArray(body.lots) ? body.lots : [];
  const settings = body.settings && typeof body.settings === "object" ? body.settings : null;
  if (lots.length === 0 && !settings) return NextResponse.json({ error: "No hay configuracion para guardar" }, { status: 400 });

  const service = createServiceClient();
  let savedLots: unknown[] | null = null;
  let savedSettings = null;

  if (lots.length > 0) {
    const rows = lots.map((lot: Record<string, unknown>, index: number) => ({
      tenant_id: tenantId,
      branch_id: null,
      lot_key: String(lot.lot_key || lot.key || `lote_${index + 1}`),
      name: String(lot.name || `Lote ${index + 1}`),
      base_price: Number(lot.base_price ?? lot.basePrice ?? 0),
      capacity: Number(lot.capacity || 0),
      position: Number(lot.position || index + 1),
      is_active: lot.is_active ?? true,
      updated_at: new Date().toISOString(),
    }));

    await service
      .from("anniversary_lots")
      .delete()
      .eq("tenant_id", tenantId)
      .is("branch_id", null);

    const { data, error } = await service
      .from("anniversary_lots")
      .insert(rows)
      .select("*")
      .order("position", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "No se pudieron guardar los lotes", detail: error.message }, { status: 500 });
    }
    savedLots = data || [];
  }

  if (settings) {
    const messages = settings.messages && typeof settings.messages === "object" ? settings.messages : DEFAULT_SETTINGS.messages;
    await service
      .from("anniversary_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .is("branch_id", null);

    const { data, error } = await service
      .from("anniversary_settings")
      .insert({
        tenant_id: tenantId,
        branch_id: null,
        event_date: String(settings.eventDate || DEFAULT_SETTINGS.eventDate),
        event_time: String(settings.eventTime || DEFAULT_SETTINGS.eventTime),
        event_location: String(settings.eventLocation || DEFAULT_SETTINGS.eventLocation),
        payment_alias: String(settings.paymentAlias || DEFAULT_SETTINGS.paymentAlias),
        payment_deadline_minutes: Number(settings.paymentDeadlineMinutes || DEFAULT_SETTINGS.paymentDeadlineMinutes),
        general_min_orders: Number(settings.generalMinOrders ?? DEFAULT_SETTINGS.generalMinOrders),
        community_min_orders: Number(settings.communityMinOrders ?? DEFAULT_SETTINGS.communityMinOrders),
        founder_min_orders: Number(settings.founderMinOrders ?? DEFAULT_SETTINGS.founderMinOrders),
        founder_top_percent: Number(settings.founderTopPercent ?? DEFAULT_SETTINGS.founderTopPercent),
        general_discount: Number(settings.generalDiscount ?? DEFAULT_SETTINGS.generalDiscount),
        community_discount: Number(settings.communityDiscount ?? DEFAULT_SETTINGS.communityDiscount),
        founder_discount: Number(settings.founderDiscount ?? DEFAULT_SETTINGS.founderDiscount),
        tier_messages: messages,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "No se pudo guardar la configuracion", detail: error.message }, { status: 500 });
    }
    savedSettings = normalizeSettings(data);
  }

  return NextResponse.json({ ok: true, lots: savedLots, settings: savedSettings });
}

export async function POST(req: NextRequest) {
  const tenantId = await getUserTenant(req);
  if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const invitationId = String(body.invitationId || "");
  const message = String(body.message || "");
  if (!invitationId || !message.trim()) {
    return NextResponse.json({ error: "Falta invitacion o mensaje" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: invitation } = await service
    .from("anniversary_invitations")
    .select("*, branches(slug)")
    .eq("tenant_id", tenantId)
    .eq("id", invitationId)
    .single();

  if (!invitation) return NextResponse.json({ error: "Invitacion no encontrada" }, { status: 404 });

  const whatsappToken = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN;
  if (!whatsappToken) {
    return NextResponse.json({ error: "Falta configurar WHATSAPP_TOKEN o WHATSAPP_API_TOKEN" }, { status: 500 });
  }

  const url = "https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${whatsappToken}`,
    },
    body: JSON.stringify({
      slug: "mordiscoburgers",
      branchId: invitation.branches?.slug || "santafe1583",
      phone: invitation.whatsapp,
      message,
    }),
  });

  const resultText = await response.text();
  let result: unknown = { raw: resultText };
  try {
    result = JSON.parse(resultText);
  } catch {}

  if (!response.ok) {
    return NextResponse.json({ error: "No se pudo enviar WhatsApp", detail: result }, { status: response.status });
  }

  await service
    .from("anniversary_invitations")
    .update({
      last_whatsapp_sent_at: new Date().toISOString(),
      last_whatsapp_message: message,
    })
    .eq("id", invitationId);

  return NextResponse.json({ ok: true, result });
}
