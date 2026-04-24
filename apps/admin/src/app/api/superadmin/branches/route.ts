import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SUPERADMIN_EMAIL =
  process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com";

export async function POST(req: NextRequest) {
  try {
    // Crear cliente de servicio (bypass RLS)
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Obtener sesión del usuario desde cookies
    const authHeader = req.headers.get("authorization");
    let userEmail: string | undefined;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      // Verificar token con Supabase Auth
      const { data: userData, error: userError } =
        await supabaseService.auth.getUser(token);
      if (!userError && userData?.user?.email) {
        userEmail = userData.user.email;
      }
    } else {
      // Intentar obtener usuario desde cookies (Next.js/ Supabase SSR)
      const { data: userData } = await supabaseService.auth.getUser();
      if (userData?.user?.email) {
        userEmail = userData.user.email;
      }
    }

    // Verificar que el usuario sea SuperAdmin
    if (userEmail !== SUPERADMIN_EMAIL) {
      return NextResponse.json(
        { error: "No autorizado. Solo SuperAdmin puede crear branches." },
        { status: 403 },
      );
    }

    // Parsear body
    const body = await req.json();
    const { tenant_id, name, slug } = body;

    if (!tenant_id || !name || !slug) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: tenant_id, name, slug" },
        { status: 400 },
      );
    }

    // Insertar branch usando cliente de servicio (bypass RLS)
    const { data: branch, error } = await supabaseService
      .from("branches")
      .insert({
        tenant_id,
        name,
        slug,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creando branch:", error);
      return NextResponse.json(
        { error: "Error al crear branch", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Branch creada exitosamente",
      branch,
    });
  } catch (error: any) {
    console.error("Error en API superadmin/branches:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 },
    );
  }
}
