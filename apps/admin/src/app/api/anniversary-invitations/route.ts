import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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
  const [{ data, error }, { data: lots, error: lotsError }] = await Promise.all([
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
  ]);

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron leer los inscriptos", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    invitations: data || [],
    lots: lotsError
      ? [
          { lot_key: "lote_1", name: "Lote 1", base_price: 20000, capacity: 0, position: 1, is_active: true },
          { lot_key: "lote_2", name: "Lote 2", base_price: 25000, capacity: 0, position: 2, is_active: true },
          { lot_key: "lote_3", name: "Lote 3", base_price: 30000, capacity: 0, position: 3, is_active: true },
        ]
      : lots || [],
    lotsError: lotsError?.message || null,
  });
}

export async function PATCH(req: NextRequest) {
  const tenantId = await getUserTenant(req);
  if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const lots = Array.isArray(body.lots) ? body.lots : [];
  if (lots.length === 0) return NextResponse.json({ error: "No hay lotes para guardar" }, { status: 400 });

  const service = createServiceClient();
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

  return NextResponse.json({ ok: true, lots: data || [] });
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

  const url = "https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
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
