import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCustomerSession } from "@/lib/customer-session";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { phone, code } = await req.json();
    if (!phone || !code) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const phoneNormalized = phone.replace(/\D/g, "").replace(/^549/, "").replace(/^54/, "");

    const { data: loginCode } = await supabase
      .from("login_codes")
      .select("*")
      .eq("phone", phoneNormalized)
      .eq("code", code.trim())
      .is("used_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!loginCode) {
      return NextResponse.json({ error: "C\u00f3digo inv\u00e1lido o expirado" }, { status: 401 });
    }

    await supabase.from("login_codes").update({ used_at: new Date().toISOString() }).eq("id", loginCode.id);

    // Get customer data for name
    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", loginCode.customer_id)
      .single();

    // Get branch ID from slug
    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id")
      .eq("slug", loginCode.branch_slug)
      .single();

    // Create proper customer session (uses customer_session cookie)
    await createCustomerSession({
      customerId: loginCode.customer_id,
      branchId: branch?.id || loginCode.branch_slug,
      tenantId: branch?.tenant_id || "",
      phone: phoneNormalized,
      name: customer?.name || undefined,
    });

    if (branch?.id) {
      await supabase.from("customer_login_logs").insert({
        customer_id: loginCode.customer_id,
        branch_id: branch.id,
        login_method: "whatsapp",
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
        user_agent: req.headers.get("user-agent") || "unknown",
      });
    }

    return NextResponse.json({
      success: true,
      returnTo: loginCode.return_to || `/${loginCode.branch_slug}/account/profile`,
    });
  } catch (err: unknown) {
    console.error("Error en verify-code:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
