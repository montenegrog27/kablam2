import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createCustomerSession } from "@/lib/customer-session";

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    // 1. Buscar y validar token
    const { data: authToken, error: tokenError } = await supabase
      .from("customer_auth_tokens")
      .select("*, customer:customers(*), branch:branches(*)")
      .eq("token", token)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (tokenError || !authToken) {
      return NextResponse.json(
        { error: "Token inválido o expirado" },
        { status: 401 },
      );
    }

    const { customer, branch } = authToken;

    // 2. Eliminar token usado (one-time use)
    await supabase.from("customer_auth_tokens").delete().eq("token", token);

    // 3. Crear sesión
    await createCustomerSession({
      customerId: customer.id,
      branchId: branch.id,
      tenantId: customer.tenant_id,
      phone: customer.phone,
      name: customer.name || undefined,
    });

    // 4. Registrar inicio de sesión
    await supabase.from("customer_login_logs").insert({
      customer_id: customer.id,
      branch_id: branch.id,
      login_method: "whatsapp",
      ip_address: req.headers.get("x-forwarded-for") || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
    });

    return NextResponse.json({
      success: true,
      message: "Autenticación exitosa",
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        birthDate: customer.birth_date,
      },
      branch: {
        id: branch.id,
        slug: branch.slug,
        name: branch.name,
      },
    });
  } catch (error: unknown) {
    console.error("Error en verify:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// También soportar GET para verificación directa desde enlace WhatsApp
export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    // 1. Buscar y validar token
    const { data: authToken, error: tokenError } = await supabase
      .from("customer_auth_tokens")
      .select("*, customer:customers(*), branch:branches(*)")
      .eq("token", token)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (tokenError || !authToken) {
      // Redirigir a página de error o login
      return NextResponse.redirect(
        new URL("/auth/login?error=token_invalid", req.url),
      );
    }

    const { customer, branch } = authToken;

    // 2. Eliminar token usado
    await supabase.from("customer_auth_tokens").delete().eq("token", token);

    // 3. Crear sesión
    await createCustomerSession({
      customerId: customer.id,
      branchId: branch.id,
      tenantId: customer.tenant_id,
      phone: customer.phone,
      name: customer.name || undefined,
    });

    // 4. Redirigir a perfil o página principal
    return NextResponse.redirect(
      new URL(`/${branch.slug}/account/profile`, req.url),
    );
  } catch (error: unknown) {
    console.error("Error en verify GET:", error);
    // Redirigir a página de error
    return NextResponse.redirect(
      new URL("/auth/login?error=internal_error", req.url),
    );
  }
}
