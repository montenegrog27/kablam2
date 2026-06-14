import { NextRequest, NextResponse } from "next/server";
import { canManageTables } from "@/lib/staffData";
import { getStaffSession } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CartItem = {
  product_id: string;
  variant_id: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
};

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCart(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item: any) => ({
      product_id: String(item.product_id || ""),
      variant_id: String(item.variant_id || ""),
      name: String(item.name || "Producto"),
      price: money(item.price),
      qty: Math.max(1, Math.floor(Number(item.qty || 1))),
    }))
    .filter((item) => item.product_id && item.variant_id && item.qty > 0);
}

async function requireTableOperator() {
  const session = await getStaffSession();
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!canManageTables(session.role)) {
    return { error: NextResponse.json({ error: "table_operator_role_required" }, { status: 403 }) };
  }
  return { session };
}

async function loadBranchTables(branchId: string) {
  const supabase = supabaseAdmin();
  const { data: tables, error } = await supabase
    .from("tables")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("number");

  if (error) throw new Error(error.message);
  return tables || [];
}

async function getSessionForTable(tableId: string, branchId: string) {
  const supabase = supabaseAdmin();
  const { data: table } = await supabase
    .from("tables")
    .select("id, branch_id, number")
    .eq("id", tableId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (!table) return { table: null, tableSession: null };

  const { data: tableSession } = await supabase
    .from("table_sessions")
    .select("*")
    .eq("table_id", tableId)
    .in("status", ["open", "paying"])
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { table, tableSession: tableSession || null };
}

async function ensureCashSession(tenantId: string, branchId: string) {
  const supabase = supabaseAdmin();
  const { data: cashSessions } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("branch_id", branchId)
    .eq("status", "open")
    .limit(1);

  if (cashSessions?.[0]?.id) return cashSessions[0].id;

  const { data: newSession } = await supabase
    .from("cash_sessions")
    .insert({
      branch_id: branchId,
      tenant_id: tenantId,
      status: "open",
      opened_at: new Date().toISOString(),
      opening_amount: 0,
    })
    .select("id")
    .single();

  return newSession?.id || null;
}

async function ensureOrder(tableSession: any, table: any, staffSession: any) {
  const supabase = supabaseAdmin();
  if (tableSession.order_id) return tableSession.order_id;

  const cashSessionId = await ensureCashSession(staffSession.tenantId, staffSession.branchId);
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      tenant_id: staffSession.tenantId,
      branch_id: staffSession.branchId,
      status: "unconfirmed",
      type: "dine-in",
      sales_channel: "staff",
      customer_name: `Mesa ${table.number}`,
      notes: `Mesa ${table.number} - Mozo: ${staffSession.name}`,
      subtotal: 0,
      total: 0,
      paid_amount: 0,
      is_paid: false,
      cash_session_id: cashSessionId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("table_sessions").update({ order_id: order.id }).eq("id", tableSession.id);
  return order.id;
}

async function insertItems(orderId: string, items: CartItem[]) {
  if (!items.length) return;
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("order_items").insert(
    items.map((item) => ({
      order_id: orderId,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.qty,
      unit_price: item.price,
      total: item.price * item.qty,
      item_type: "product",
    })),
  );
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest) {
  const auth = await requireTableOperator();
  if (auth.error) return auth.error;
  const staffSession = auth.session!;
  const supabase = supabaseAdmin();
  const tableId = req.nextUrl.searchParams.get("tableId");

  if (tableId) {
    const { table, tableSession } = await getSessionForTable(tableId, staffSession.branchId);
    if (!table) return NextResponse.json({ error: "table_not_found" }, { status: 404 });

    let items: any[] = [];
    if (tableSession?.order_id) {
      const { data } = await supabase
        .from("order_items")
        .select("*, products(name)")
        .eq("order_id", tableSession.order_id);
      items = data || [];
    }

    return NextResponse.json({ table, tableSession, items });
  }

  const tables = await loadBranchTables(staffSession.branchId);
  const tableIds = tables.map((table: any) => table.id);

  const [{ data: sessions }, { data: paymentMethods }, { data: floorObjects }, { data: products }] =
    await Promise.all([
      tableIds.length
        ? supabase.from("table_sessions").select("*").in("table_id", tableIds).in("status", ["open", "paying"])
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true)
        .or(`tenant_id.eq.${staffSession.tenantId},tenant_id.is.null`),
      supabase.from("floor_objects").select("*").eq("branch_id", staffSession.branchId),
      supabase
        .from("products")
        .select("*, product_variants(*)")
        .eq("branch_id", staffSession.branchId)
        .eq("is_active", true)
        .order("name"),
    ]);

  return NextResponse.json({
    session: staffSession,
    tables,
    sessions: sessions || [],
    paymentMethods: paymentMethods || [],
    floorObjects: floorObjects || [],
    products: products || [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTableOperator();
    if (auth.error) return auth.error;
    const staffSession = auth.session!;
    const body = await req.json();
    const action = String(body.action || "");
    const tableId = String(body.tableId || "");
    const supabase = supabaseAdmin();

    if (!tableId) return NextResponse.json({ error: "table_required" }, { status: 400 });

    const { table, tableSession } = await getSessionForTable(tableId, staffSession.branchId);
    if (!table) return NextResponse.json({ error: "table_not_found" }, { status: 404 });

    if (action === "start_session") {
      if (tableSession) return NextResponse.json({ tableSession, status: "already_open" });

      const { data, error } = await supabase
        .from("table_sessions")
        .insert({
          table_id: tableId,
          status: "open",
          customer_count: Math.max(1, Math.floor(Number(body.customerCount || 1))),
          total: 0,
        })
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ tableSession: data, status: "opened" });
    }

    if (!tableSession) return NextResponse.json({ error: "table_session_not_found" }, { status: 404 });

    if (action === "accept_items") {
      const items = normalizeCart(body.items);
      if (!items.length) return NextResponse.json({ error: "items_required" }, { status: 400 });
      const orderId = await ensureOrder(tableSession, table, staffSession);
      await insertItems(orderId, items);
      const addedTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const total = money(tableSession.total) + addedTotal;
      await supabase.from("table_sessions").update({ order_id: orderId, total }).eq("id", tableSession.id);
      await supabase.from("orders").update({ subtotal: total, total }).eq("id", orderId);
      return NextResponse.json({ orderId, total, status: "items_accepted" });
    }

    if (action === "send_order") {
      const items = normalizeCart(body.items);
      if (!items.length) return NextResponse.json({ error: "items_required" }, { status: 400 });
      const orderId = await ensureOrder(tableSession, table, staffSession);
      await insertItems(orderId, items);
      const addedTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const total = money(tableSession.total) + addedTotal;
      await supabase
        .from("orders")
        .update({
          status: "confirmed",
          subtotal: total,
          total,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      await supabase.from("table_sessions").update({ status: "open", order_id: orderId, total }).eq("id", tableSession.id);
      return NextResponse.json({ orderId, total, status: "sent_to_kitchen" });
    }

    if (action === "close_table") {
      if (!tableSession.order_id) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
      const total = money(tableSession.total);
      await supabase.from("table_sessions").update({ status: "paying", total }).eq("id", tableSession.id);
      await supabase
        .from("orders")
        .update({
          status: "confirmed",
          subtotal: total,
          total,
        })
        .eq("id", tableSession.order_id);
      return NextResponse.json({ orderId: tableSession.order_id, total, status: "table_closed" });
    }

    if (action === "reopen_table") {
      await supabase.from("table_sessions").update({ status: "open" }).eq("id", tableSession.id);
      return NextResponse.json({ status: "reopened" });
    }

    if (action === "pay_table") {
      const paymentMethodId = String(body.paymentMethodId || "");
      const paymentRef = String(body.paymentRef || "");
      if (!paymentMethodId) return NextResponse.json({ error: "payment_method_required" }, { status: 400 });
      if (!tableSession.order_id) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

      const total = money(body.total) || money(tableSession.total);
      await supabase
        .from("orders")
        .update({
          status: "delivered",
          subtotal: total,
          total,
          paid_amount: total,
          is_paid: true,
        })
        .eq("id", tableSession.order_id);

      await supabase.from("order_payments").insert({
        order_id: tableSession.order_id,
        payment_method_id: paymentMethodId,
        amount: total,
        reference: paymentRef || null,
      });

      await supabase
        .from("table_sessions")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", tableSession.id);

      return NextResponse.json({ status: "paid" });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "table_action_failed", details: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
