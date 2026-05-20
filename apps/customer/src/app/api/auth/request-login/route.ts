import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "kablam-secret-change-in-production";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSafeReturnTo(value: unknown, branchSlug: string) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return `/${branchSlug}/account/profile`;
  }

  if (value.startsWith("//") || !value.startsWith(`/${branchSlug}/`)) {
    return `/${branchSlug}/account/profile`;
  }

  return value;
}

export async function POST(req: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { phone, branchSlug, returnTo } = await req.json();

    if (!phone || !branchSlug) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const phoneNormalized = phone.replace(/\D/g, "").replace(/^549/, "").replace(/^54/, "");

    // Buscar branch
    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id")
      .eq("slug", branchSlug)
      .single();

    if (!branch) {
      return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
    }

    // Buscar o crear customer
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

    if (!customer) {
      return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
    }

    // Generar token mágico (5 min de expiración)
    const safeReturnTo = getSafeReturnTo(returnTo, branchSlug);
    const magicToken = jwt.sign(
      {
        phone: phoneNormalized,
        customerId: customer.id,
        branchId: branch.id,
        tenantId: branch.tenant_id,
        branchSlug,
        returnTo: safeReturnTo,
        type: "magic_link",
      },
      JWT_SECRET,
      { expiresIn: "5m" }
    );

    // Buscar número de WhatsApp de la sucursal
    const { data: whatsappNumber } = await supabase
      .from("whatsapp_numbers")
      .select("phone_number_id, access_token")
      .eq("branch_id", branch.id)
      .single();

    if (!whatsappNumber) {
      return NextResponse.json({ error: "WhatsApp no configurado" }, { status: 500 });
    }

    // Enviar template por WhatsApp con botón CTA
    const waRes = await fetch(
      `https://graph.facebook.com/v18.0/${whatsappNumber.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsappNumber.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: `54${phoneNormalized}`,
          type: "template",
          template: {
            name: "login",
            language: { code: "es_AR" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: customer.name || "cliente" }],
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: magicToken }],
              },
            ],
          },
        }),
      }
    );

    const waResult = await waRes.json();
    console.log("📱 WhatsApp response:", waResult);

    if (waResult.error) {
      console.error("WhatsApp error:", waResult.error);
      return NextResponse.json({ error: "Error al enviar WhatsApp", details: waResult.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Mensaje enviado" });
  } catch (err: unknown) {
    console.error("Error en request-login:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
