import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ branchId: string }> },
) {
  try {
    const { branchId } = await params;
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const supabaseService = createServiceClient();
    const { data: authUser, error: authError } =
      await supabaseService.auth.getUser(token);

    if (authError || !authUser.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: userRecord } = await supabaseService
      .from("users")
      .select("tenant_id, role")
      .eq("id", authUser.user.id)
      .single();

    if (!userRecord?.tenant_id) {
      return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 });
    }

    const { data: branch } = await supabaseService
      .from("branches")
      .select("id, tenant_id, name")
      .eq("id", branchId)
      .single();

    if (!branch || branch.tenant_id !== userRecord.tenant_id) {
      return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
    }

    const { error } = await supabaseService
      .from("branches")
      .update({ active: false })
      .eq("id", branchId);

    if (error) {
      return NextResponse.json(
        { error: "No se pudo eliminar la sucursal", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error interno", details: error.message },
      { status: 500 },
    );
  }
}
