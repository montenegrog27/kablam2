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
    .select("id, name, parent_id, position")
    .eq("tenant_id", branch.tenant_id)
    .order("position");

  return Response.json(categories || []);
}
