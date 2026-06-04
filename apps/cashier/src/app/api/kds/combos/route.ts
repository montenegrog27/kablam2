import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createSupabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length);
}

async function userCanViewKds(supabase: ReturnType<typeof createSupabaseService>, userRecord: any) {
  if (["owner", "admin"].includes(userRecord.role)) return true;
  if (!userRecord.role_id) return userRecord.role === "cashier";

  const { data } = await supabase
    .from("role_permissions")
    .select("permissions!inner(key)")
    .eq("role_id", userRecord.role_id)
    .eq("permissions.key", "cashier.kds.view")
    .limit(1);

  return (data || []).length > 0;
}

export async function GET(request: NextRequest) {
  try {
    const branchId = request.nextUrl.searchParams.get("branchId");
    if (!branchId) {
      return NextResponse.json({ error: "branch_id_required" }, { status: 400 });
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseService();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const authUser = authData.user;

    if (authError || !authUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("id, tenant_id, branch_id, role, role_id")
      .eq("id", authUser.id)
      .single();

    if (!userRecord?.tenant_id) {
      return NextResponse.json({ error: "user_not_found" }, { status: 403 });
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id")
      .eq("id", branchId)
      .single();

    if (!branch || branch.tenant_id !== userRecord.tenant_id) {
      return NextResponse.json({ error: "branch_forbidden" }, { status: 403 });
    }

    const canUseBranch = ["owner", "admin"].includes(userRecord.role) || userRecord.branch_id === branchId;
    if (!canUseBranch) {
      return NextResponse.json({ error: "branch_forbidden" }, { status: 403 });
    }

    const canViewKds = await userCanViewKds(supabase, userRecord);
    if (!canViewKds) {
      return NextResponse.json({ error: "permission_forbidden" }, { status: 403 });
    }

    const { data: combos, error: combosError } = await supabase
      .from("combos")
      .select("id, name, combo_products(id, product_id, quantity, products(id, name, category_id, is_preparable, product_variants(id, is_default)))")
      .or(`tenant_id.eq.${userRecord.tenant_id},branch_id.eq.${branchId}`);

    if (combosError) {
      return NextResponse.json({ error: "combos_load_failed", details: combosError.message }, { status: 500 });
    }

    return NextResponse.json({ combos: combos || [] });
  } catch (error) {
    return NextResponse.json(
      { error: "combos_load_failed", details: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
