import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SUPERADMIN_EMAIL =
  process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function isSuperAdmin(req: NextRequest, supabaseService: any) {
  const authHeader = req.headers.get("authorization");
  let userEmail: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data: userData, error: userError } =
      await supabaseService.auth.getUser(token);
    if (!userError && userData?.user?.email) {
      userEmail = userData.user.email;
    }
  } else {
    const { data: userData } = await supabaseService.auth.getUser();
    if (userData?.user?.email) {
      userEmail = userData.user.email;
    }
  }

  return userEmail === SUPERADMIN_EMAIL;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseService = createServiceClient();

    if (!(await isSuperAdmin(req, supabaseService))) {
      return NextResponse.json(
        { error: "No autorizado. Solo SuperAdmin puede crear tenants." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { name, slug, plan, trial_ends_at } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: name, slug" },
        { status: 400 },
      );
    }

    const { data: tenant, error } = await supabaseService
      .from("tenants")
      .insert({
        name,
        slug,
        plan: plan || "free",
        trial_ends_at: trial_ends_at || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creando tenant:", error);
      return NextResponse.json(
        { error: "Error al crear tenant", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Tenant creado exitosamente",
      tenant,
    });
  } catch (error: any) {
    console.error("Error en API superadmin/tenants:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabaseService = createServiceClient();

    if (!(await isSuperAdmin(req, supabaseService))) {
      return NextResponse.json(
        { error: "No autorizado. Solo SuperAdmin puede editar tenants." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { id, name, slug, plan, trial_ends_at } = body;

    if (!id || !name || !slug) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: id, name, slug" },
        { status: 400 },
      );
    }

    const { data: tenant, error } = await supabaseService
      .from("tenants")
      .update({
        name,
        slug,
        plan: plan || "free",
        trial_ends_at: trial_ends_at || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error editando tenant:", error);
      return NextResponse.json(
        { error: "Error al editar tenant", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Tenant editado exitosamente",
      tenant,
    });
  } catch (error: any) {
    console.error("Error en API superadmin/tenants PUT:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 },
    );
  }
}
