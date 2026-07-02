import { applyCatalogOrderStockMovement } from "@kablam/supabase/stock";
import { NextRequest, NextResponse } from "next/server";
import { authErrorStatus, getAdminUser } from "@/lib/ads-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const auth = await getAdminUser(req, ["owner", "manager", "admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: authErrorStatus(auth.error) });
  }

  const { orderId } = await params;
  const body = await req.json();
  const nextStatus = String(body.status || "").trim();
  const patch = body.patch && typeof body.patch === "object" ? body.patch : {};
  if (!orderId || !nextStatus) {
    return NextResponse.json({ error: "order_id_and_status_required" }, { status: 400 });
  }

  const { data: order, error: orderError } = await auth.supabase
    .from("catalog_orders")
    .select("id, tenant_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    return NextResponse.json({ error: "order_lookup_failed", details: orderError.message }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.tenant_id !== auth.user.tenant_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: updateError } = await auth.supabase
    .from("catalog_orders")
    .update({ ...patch, status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", auth.user.tenant_id);
  if (updateError) {
    return NextResponse.json({ error: "status_update_failed", details: updateError.message }, { status: 500 });
  }

  let stockResult = null;
  try {
    if (order.status !== "delivered" && nextStatus === "delivered") {
      stockResult = await applyCatalogOrderStockMovement({
        supabase: auth.supabase,
        catalogOrderId: orderId,
        action: "sale",
        userId: auth.user.id,
      });
    }
    if (order.status === "delivered" && nextStatus === "cancelled") {
      stockResult = await applyCatalogOrderStockMovement({
        supabase: auth.supabase,
        catalogOrderId: orderId,
        action: "reversal",
        userId: auth.user.id,
      });
    }
  } catch (error: any) {
    await auth.supabase
      .from("catalog_orders")
      .update({ status: order.status, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    return NextResponse.json({ error: "stock_update_failed", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, previousStatus: order.status, status: nextStatus, stock: stockResult });
}
