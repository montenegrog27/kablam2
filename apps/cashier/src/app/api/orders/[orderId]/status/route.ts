import { applyOrderStockMovement } from "@kablam/supabase/stock";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const supabase = createServiceClient();
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, tenant_id, branch_id, role")
    .eq("id", authData.user.id)
    .single();
  if (!userRecord?.tenant_id) {
    return NextResponse.json({ error: "user_without_tenant" }, { status: 403 });
  }

  const { orderId } = await params;
  const body = await req.json();
  const nextStatus = String(body.status || "").trim();
  const updates = body.updates && typeof body.updates === "object" ? body.updates : {};
  if (!orderId || !nextStatus) {
    return NextResponse.json({ error: "order_id_and_status_required" }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, tenant_id, branch_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    return NextResponse.json({ error: "order_lookup_failed", details: orderError.message }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.tenant_id !== userRecord.tenant_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ ...updates, status: nextStatus })
    .eq("id", orderId);
  if (updateError) {
    return NextResponse.json({ error: "status_update_failed", details: updateError.message }, { status: 500 });
  }

  let stockResult = null;
  try {
    if (order.status !== "delivered" && nextStatus === "delivered") {
      stockResult = await applyOrderStockMovement({ supabase, orderId, action: "sale", userId: userRecord.id });
    }
    if (order.status === "delivered" && nextStatus === "cancelled") {
      stockResult = await applyOrderStockMovement({ supabase, orderId, action: "reversal", userId: userRecord.id });
    }
  } catch (error: any) {
    await supabase
      .from("orders")
      .update({ status: order.status })
      .eq("id", orderId);
    return NextResponse.json({ error: "stock_update_failed", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, previousStatus: order.status, status: nextStatus, stock: stockResult });
}
