import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return Response.json({ error: "slug required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: branch } = await supabase
    .from("branches")
    .select("id, tenant_id")
    .ilike("slug", slug)
    .single();

  if (!branch) {
    return Response.json({ error: "Branch not found" }, { status: 404 });
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, parent_id, position, delivery_position, delivery_visible, active")
    .eq("tenant_id", branch.tenant_id)
    .eq("delivery_visible", true)
    .or("active.is.null,active.eq.true")
    .order("delivery_position")
    .order("position");

  return Response.json(
    (categories || []).map((category) => ({
      id: category.id,
      name: category.name,
      parent_id: category.parent_id,
      position: category.delivery_position ?? category.position ?? 0,
    })),
  );
}
