import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const body = await req.json();
  const { name, phone, companions, branchSlug } = body;

  if (!name || !phone || !branchSlug) {
    return Response.json({ success: false, error: "Faltan datos" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: branch } = await supabase
    .from("branches")
    .select("tenant_id")
    .ilike("slug", branchSlug)
    .single();

  if (!branch) {
    return Response.json({ success: false, error: "Sucursal no encontrada" }, { status: 404 });
  }

  const { error } = await supabase.from("event_registrations").insert({
    tenant_id: branch.tenant_id,
    branch_slug: branchSlug,
    name,
    phone: phone.replace(/\D/g, ""),
    companions: Number(companions) || 0,
  });

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const branchSlug = url.searchParams.get("branchSlug");
  const eventSlug = url.searchParams.get("event") || "cumple-mordisco";

  if (!branchSlug) {
    return Response.json({ error: "branchSlug required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: registrations } = await supabase
    .from("event_registrations")
    .select("*")
    .eq("branch_slug", branchSlug)
    .eq("event_slug", eventSlug)
    .order("created_at", { ascending: false });

  return Response.json(registrations || []);
}
