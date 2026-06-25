import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { phone, branchSlug, returnTo } = await req.json();
    if (!phone || !branchSlug) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const phoneNormalized = phone.replace(/\D/g, "").replace(/^549/, "").replace(/^54/, "").replace(/^9(\d{10})$/, "$1");

    // Find branch
    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id, slug")
      .eq("slug", branchSlug)
      .single();
    if (!branch) return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });

    const { data: tenant } = await supabase
      .from("tenants")
      .select("slug, name")
      .eq("id", branch.tenant_id)
      .maybeSingle();

    // Find or create customer
    let { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", branch.tenant_id)
      .eq("phone", phoneNormalized)
      .maybeSingle();

    if (!customer) {
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert({ tenant_id: branch.tenant_id, phone: phoneNormalized })
        .select()
        .single();
      customer = newCustomer;
    }
    if (!customer) return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });

    // Generate 4-digit code
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Save code to DB
    const { error: insertError } = await supabase.from("login_codes").insert({
      tenant_id: branch.tenant_id,
      phone: phoneNormalized,
      code,
      customer_id: customer.id,
      branch_slug: branchSlug,
      return_to: returnTo || null,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("Error saving login code:", insertError);
      return NextResponse.json({ error: "Error al generar código" }, { status: 500 });
    }

    // Send via WhatsApp server
    const whatsappToken = String(process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN || "")
      .trim().replace(/^["']|["']$/g, "");
    if (!whatsappToken) return NextResponse.json({ error: "WhatsApp no configurado" }, { status: 500 });

    const waRes = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${whatsappToken}` },
      body: JSON.stringify({
        slug: tenant?.slug || branch.slug,
        branchId: branch.slug,
        phone: `549${phoneNormalized}`,
        message: `Tu código de acceso a ${tenant?.name || "Kablam"} es: ${code}. Nunca lo compartas.`,
      }),
    });

    const waText = await waRes.text();
    let waData: { error?: string } | null = null;
    try {
      waData = waText ? JSON.parse(waText) : null;
    } catch {
      waData = null;
    }

    if (!waRes.ok) {
      console.error("WhatsApp login error:", {
        status: waRes.status,
        response: waText.slice(0, 180),
      });
      return NextResponse.json(
        { error: waData?.error || "No pudimos enviar el codigo por WhatsApp" },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, message: "Codigo enviado" });
  } catch (err: unknown) {
    console.error("Error en request-login:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
