import { validateCoupon } from "@/lib/validateCoupon";
import { supabase } from "@kablam/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { code, branchSlug, subtotal, phone } = body; // 👈 FIX

    if (!branchSlug) {
      return Response.json({ valid: false, error: "Missing branchSlug" });
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id")
      .eq("slug", branchSlug)
      .single();

    if (!branch) {
      return Response.json({ valid: false, error: "Branch not found" });
    }

    const result = await validateCoupon({
      code,
      tenantId: branch.tenant_id,
      orderTotal: subtotal,
      phone, // 👈 FIX 🔥
    });

    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ valid: false, error: "Server error" });
  }
}