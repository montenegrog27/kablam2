import { NextRequest, NextResponse } from "next/server";
import { authErrorStatus, getAdminUser } from "@/lib/ads-auth";
import { applyOrderStockMovement } from "@kablam/supabase/stock";

const CHILD_TABLES = [
  "order_payments",
  "order_items",
  "order_analytics",
  "promotion_analytics",
  "loyalty_transactions",
  "kds_order_events",
];

function isMissingOptionalRelation(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    /Could not find the table/i.test(error.message || "") ||
    /Could not find .* in the schema cache/i.test(error.message || "")
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const auth = await getAdminUser(req, ["owner"]);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: authErrorStatus(auth.error) },
    );
  }

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "order_id_required" }, { status: 400 });
  }

  const { data: order, error: orderError } = await auth.supabase
    .from("orders")
    .select("id, tenant_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json(
      { error: "order_lookup_failed", details: orderError.message },
      { status: 500 },
    );
  }

  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  if (order.tenant_id !== auth.user.tenant_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (order.status === "delivered") {
    try {
      await applyOrderStockMovement({
        supabase: auth.supabase,
        orderId,
        action: "reversal",
        userId: auth.user.id,
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: "stock_reversal_failed", details: error.message },
        { status: 500 },
      );
    }
  }

  for (const table of CHILD_TABLES) {
    const { error } = await auth.supabase.from(table).delete().eq("order_id", orderId);
    if (error && !isMissingOptionalRelation(error)) {
      return NextResponse.json(
        { error: "child_delete_failed", table, details: error.message },
        { status: 500 },
      );
    }
  }

  const { error: deleteError } = await auth.supabase
    .from("orders")
    .delete()
    .eq("id", orderId);

  if (deleteError) {
    return NextResponse.json(
      { error: "order_delete_failed", details: deleteError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
