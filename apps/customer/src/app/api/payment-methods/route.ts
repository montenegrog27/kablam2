import { createClient } from "@supabase/supabase-js";

function normalizePaymentText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isCustomerAllowedPaymentMethod(method: { name?: string | null; type?: string | null }) {
  const type = normalizePaymentText(method.type);
  const name = normalizePaymentText(method.name);
  return type === "cash" || type === "transfer" || name.includes("efectivo") || name.includes("transferencia");
}

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { searchParams } = new URL(req.url);
  const branchSlug = searchParams.get("branchSlug");

  if (!branchSlug) {
    return Response.json({ methods: [] });
  }

  const { data: branch } = await supabase
    .from("branches")
    .select("id, tenant_id")
    .eq("slug", branchSlug)
    .single();

  if (!branch) {
    return Response.json({ methods: [] });
  }

  // Traer métodos específicos de la branch O métodos del tenant (branch_id = null)
  const { data: methods, error } = await supabase
    .from("payment_methods")
    .select("id, name, type, requires_reference")
    .eq("is_active", true)
    .eq("tenant_id", branch.tenant_id)
    .or(`branch_id.eq.${branch.id},branch_id.is.null`)
    .order("name");

  console.log("PAYMENT METHODS QUERY:", {
    methods,
    error,
    branchId: branch.id,
  });

  return Response.json({ methods: (methods || []).filter(isCustomerAllowedPaymentMethod) });
}
