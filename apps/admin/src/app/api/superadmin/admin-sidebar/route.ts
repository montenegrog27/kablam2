import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SUPERADMIN_EMAIL =
  process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function checkSuperAdmin(req: NextRequest): Promise<string | null> {
  const supabase = getServiceClient();
  const authHeader = req.headers.get("authorization");
  let email: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data } = await supabase.auth.getUser(token);
    email = data?.user?.email;
  } else {
    const { data } = await supabase.auth.getUser();
    email = data?.user?.email;
  }
  return email === SUPERADMIN_EMAIL ? email : null;
}

// GET /api/superadmin/admin-sidebar?tenant_id=xxx
export async function GET(req: NextRequest) {
  if (!(await checkSuperAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  if (!tenantId) {
    return NextResponse.json({ error: "Falta tenant_id" }, { status: 400 });
  }
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("admin_sidebar_hidden")
    .select("nav_key")
    .eq("tenant_id", tenantId);
  return NextResponse.json({ hidden: (data || []).map((r) => r.nav_key) });
}

// POST /api/superadmin/admin-sidebar
export async function POST(req: NextRequest) {
  if (!(await checkSuperAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { tenant_id, nav_key } = await req.json();
  if (!tenant_id || !nav_key) {
    return NextResponse.json({ error: "Faltan tenant_id o nav_key" }, { status: 400 });
  }
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("admin_sidebar_hidden")
    .insert({ tenant_id, nav_key });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/superadmin/admin-sidebar
export async function DELETE(req: NextRequest) {
  if (!(await checkSuperAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { tenant_id, nav_key } = await req.json();
  if (!tenant_id || !nav_key) {
    return NextResponse.json({ error: "Faltan tenant_id o nav_key" }, { status: 400 });
  }
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("admin_sidebar_hidden")
    .delete()
    .eq("tenant_id", tenant_id)
    .eq("nav_key", nav_key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
