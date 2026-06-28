import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const branchSlug = url.searchParams.get("branchSlug");
  const channel = url.searchParams.get("channel") || "order";

  if (!branchSlug) {
    return Response.json({ error: "branchSlug required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: branch } = await supabase
    .from("branches")
    .select("id, tenant_id")
    .eq("slug", branchSlug)
    .single();

  if (!branch) {
    return Response.json({ error: "Branch not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  let query = supabase
    .from("flash_sales")
    .select("*, flash_sale_categories!left(category_id)")
    .eq("tenant_id", branch.tenant_id)
    .eq("is_active", true)
    .lte("start_at", now)
    .gte("end_at", now);

  if (channel === "qr") query = query.eq("show_in_qr", true);
  if (channel === "catalog" || channel === "catalogo") query = query.eq("show_in_catalog", true);
  if (channel === "order") query = query.eq("show_in_order", true);

  const { data: sales } = await query;

  return Response.json((sales || []).filter((s) => (s.flash_sale_categories || []).length > 0));
}
