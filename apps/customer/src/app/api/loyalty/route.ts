import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCustomerSession } from "@/lib/customer-session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({
      authenticated: false,
      rules: [],
      levels: [],
    });
  }

  const url = new URL(req.url);
  const branchSlug = url.searchParams.get("branchSlug");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let tenantId = session.tenantId;

  if (branchSlug) {
    const { data: branch } = await supabase
      .from("branches")
      .select("tenant_id")
      .eq("slug", branchSlug)
      .maybeSingle();
    tenantId = branch?.tenant_id || tenantId;
  }

  const [rulesRes, levelsRes] = await Promise.all([
    supabase
      .from("loyalty_rules")
      .select("id, name, type, points_per_amount, points_per_unit, points_per_extra_peso, minimum_amount, product_id, combo_id, category_id, is_active, priority")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("priority", { ascending: true }),
    supabase
      .from("loyalty_levels")
      .select("name, min_points, max_points")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("min_points", { ascending: true }),
  ]);

  if (rulesRes.error?.code === "42P01") {
    return NextResponse.json({
      authenticated: true,
      rules: [],
      levels: [],
      warning: "loyalty_schema_missing",
    });
  }

  return NextResponse.json({
    authenticated: true,
    rules: rulesRes.data || [],
    levels: (levelsRes.data || []).map((level: any) => ({
      name: level.name,
      minPoints: level.min_points || 0,
      maxPoints: level.max_points ?? null,
    })),
  });
}
