import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function authorize(req: NextRequest, permission: string) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "missing_token" as const, status: 401 };

  const supabase = serviceClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const authUser = authData.user;
  if (authError || !authUser) return { error: "invalid_token" as const, status: 401 };

  const { data: user } = await supabase
    .from("users")
    .select("id, tenant_id, branch_id, role, role_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!user) return { error: "user_not_found" as const, status: 403 };
  if (["owner", "admin"].includes(user.role)) return { supabase, user };

  if (!user.role_id) return { error: "permission_denied" as const, status: 403 };

  const { data: rolePerm } = await supabase
    .from("role_permissions")
    .select("permissions!inner(key)")
    .eq("role_id", user.role_id)
    .eq("permissions.key", permission)
    .maybeSingle();

  if (!rolePerm) return { error: "permission_denied" as const, status: 403 };
  return { supabase, user };
}

function isMissingCashSessionExpenseColumn(error: any) {
  return (
    error?.code === "42703" &&
    String(error?.message || "").includes("expenses.cash_session_id")
  );
}

function missingCashierExpensesSetupResponse() {
  return NextResponse.json(
    {
      error: "cashier_expenses_schema_missing",
      message: "Falta actualizar Supabase: ejecuta add_cashier_expenses.sql para asociar gastos al turno de caja.",
      setupFile: "add_cashier_expenses.sql",
    },
    { status: 500 },
  );
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req, "cashier.expenses.view");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cashSessionId = req.nextUrl.searchParams.get("cashSessionId");
  if (!cashSessionId) return NextResponse.json({ error: "cash_session_required" }, { status: 400 });

  const { data: session } = await auth.supabase
    .from("cash_sessions")
    .select("id, tenant_id, branch_id, cash_register_id, status")
    .eq("id", cashSessionId)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "cash_session_not_found" }, { status: 404 });

  const [expensesResult, { data: categories }] = await Promise.all([
    auth.supabase
      .from("expenses")
      .select("*, expense_categories(name)")
      .eq("cash_session_id", session.id)
      .order("created_at", { ascending: false }),
    auth.supabase
      .from("expense_categories")
      .select("*")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("is_active", true)
      .order("name"),
  ]);

  if (expensesResult.error) {
    if (isMissingCashSessionExpenseColumn(expensesResult.error)) return missingCashierExpensesSetupResponse();
    return NextResponse.json({ error: expensesResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ expenses: expensesResult.data || [], categories: categories || [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req, "cashier.expenses.create");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const cashSessionId = String(body.cashSessionId || "");
  const description = String(body.description || "").trim();
  const amount = Number(body.amount || 0);
  const categoryId = body.categoryId ? String(body.categoryId) : null;

  if (!cashSessionId || !description || amount <= 0) {
    return NextResponse.json({ error: "invalid_expense" }, { status: 400 });
  }

  const { data: session } = await auth.supabase
    .from("cash_sessions")
    .select("id, tenant_id, branch_id, cash_register_id, status")
    .eq("id", cashSessionId)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "cash_session_not_found" }, { status: 404 });
  if (session.status !== "open") return NextResponse.json({ error: "cash_session_closed" }, { status: 409 });

  const { data: expense, error } = await auth.supabase
    .from("expenses")
    .insert({
      tenant_id: session.tenant_id,
      branch_id: session.branch_id,
      cash_session_id: session.id,
      cash_register_id: session.cash_register_id,
      category_id: categoryId,
      description,
      amount,
      total: amount,
      expense_date: new Date().toISOString().split("T")[0],
      created_by: auth.user.id,
      paid_from_central: false,
    })
    .select("*, expense_categories(name)")
    .single();

  if (error) {
    if (isMissingCashSessionExpenseColumn(error)) return missingCashierExpensesSetupResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ expense });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorize(req, "cashier.expenses.delete");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "expense_id_required" }, { status: 400 });

  const { data: expense, error: expenseError } = await auth.supabase
    .from("expenses")
    .select("id, tenant_id, cash_session_id, cash_sessions(status)")
    .eq("id", id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();

  if (expenseError) {
    if (isMissingCashSessionExpenseColumn(expenseError)) return missingCashierExpensesSetupResponse();
    return NextResponse.json({ error: expenseError.message }, { status: 500 });
  }

  if (!expense) return NextResponse.json({ error: "expense_not_found" }, { status: 404 });
  if ((expense.cash_sessions as any)?.status !== "open") {
    return NextResponse.json({ error: "cash_session_closed" }, { status: 409 });
  }

  const { error } = await auth.supabase.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
