import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const branchSlug = searchParams.get("branchSlug") || searchParams.get("slug") || "";
  if (!branchSlug) return Response.json([]);

  const supabase = createServiceClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("id, tenant_id")
    .eq("slug", branchSlug)
    .maybeSingle();

  if (!branch) return Response.json([]);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("promotions")
    .select("*, promotion_targets(target_type, target_id)")
    .eq("tenant_id", branch.tenant_id)
    .eq("active", true)
    .eq("show_in_home", true)
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const promotions = data || [];
  const promotionIds = promotions.map((promotion) => promotion.id);
  let rulesByPromotion: Record<string, unknown[]> = {};

  if (promotionIds.length > 0) {
    const { data: rules } = await supabase
      .from("promotion_rules")
      .select("*")
      .eq("tenant_id", branch.tenant_id)
      .eq("active", true)
      .in("promotion_id", promotionIds)
      .order("priority", { ascending: false });

    rulesByPromotion = (rules || []).reduce((acc: Record<string, unknown[]>, rule: any) => {
      if (!rule.promotion_id) return acc;
      acc[rule.promotion_id] = [...(acc[rule.promotion_id] || []), rule];
      return acc;
    }, {});
  }

  return Response.json(
    promotions.map((promotion) => ({
      ...promotion,
      promotion_rules: rulesByPromotion[promotion.id] || [],
    })),
  );
}
