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

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseService = createServiceClient();

    if (!(await isSuperAdmin(req, supabaseService))) {
      return NextResponse.json(
        { error: "No autorizado. Solo SuperAdmin puede crear branches." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { tenant_id, name, slug, address, phone, lat, lng } = body;

    if (!tenant_id || !name || !slug) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: tenant_id, name, slug" },
        { status: 400 },
      );
    }

    const { data: branch, error } = await supabaseService
      .from("branches")
      .insert({
        tenant_id,
        name,
        slug,
        address: address || null,
        phone: phone || null,
        lat: numberOrNull(lat),
        lng: numberOrNull(lng),
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

export async function PUT(req: NextRequest) {
  try {
    const supabaseService = createServiceClient();

    if (!(await isSuperAdmin(req, supabaseService))) {
      return NextResponse.json(
        { error: "No autorizado. Solo SuperAdmin puede editar branches." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      id,
      tenant_id,
      name,
      slug,
      address,
      phone,
      lat,
      lng,
      active,
      delivery_enabled,
      pickup_enabled,
      dine_in_enabled,
    } = body;

    if (!id || !tenant_id || !name || !slug) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: id, tenant_id, name, slug" },
        { status: 400 },
      );
    }

    const { data: branch, error } = await supabaseService
      .from("branches")
      .update({
        tenant_id,
        name,
        slug,
        address: address || null,
        phone: phone || null,
        lat: numberOrNull(lat),
        lng: numberOrNull(lng),
        active: active ?? true,
        delivery_enabled: delivery_enabled ?? true,
        pickup_enabled: pickup_enabled ?? true,
        dine_in_enabled: dine_in_enabled ?? true,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error editando branch:", error);
      return NextResponse.json(
        { error: "Error al editar branch", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Branch editada exitosamente",
      branch,
    });
  } catch (error: any) {
    console.error("Error en API superadmin/branches PUT:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 },
    );
  }
}
