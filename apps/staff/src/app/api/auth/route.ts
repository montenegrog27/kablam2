import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createStaffToken, getStaffSession, STAFF_COOKIE } from "@/lib/staffSession";
import { getLatestAttendance, normalizeCode, normalizeEmail } from "@/lib/staffData";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
};

async function resolveBranch(employee: any, branchId?: string) {
  const supabase = supabaseAdmin();

  if (branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id, name")
      .eq("id", branchId)
      .maybeSingle();

    if (!branch?.tenant_id) return { error: "branch_not_found" };
    if (branch.tenant_id !== employee.tenant_id) return { error: "invalid_branch_for_employee" };
    if (employee.branch_id && employee.branch_id !== branch.id) return { error: "invalid_branch_for_employee" };
    return { branch };
  }

  if (employee.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id, name")
      .eq("id", employee.branch_id)
      .maybeSingle();

    if (!branch?.tenant_id) return { error: "branch_not_found" };
    return { branch };
  }

  const { data: branches, error } = await supabase
    .from("branches")
    .select("id, tenant_id, name")
    .eq("tenant_id", employee.tenant_id)
    .order("name");

  if (error) return { error: error.message };
  if ((branches || []).length === 1) return { branch: branches![0] };

  return {
    status: "branch_required",
    branches: branches || [],
    message: "Elegi la sucursal para iniciar sesion.",
  };
}

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });

  const latestAttendance = await getLatestAttendance(session.employeeId, session.tenantId);
  return NextResponse.json({
    authenticated: true,
    session,
    latestAttendance,
    openAttendance: latestAttendance && !latestAttendance.clock_out_at ? latestAttendance : null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = normalizeEmail(body.email);
  const code = normalizeCode(body.code);
  const branchId = String(body.branchId || "");

  if (!email || !code) {
    return NextResponse.json({ error: "email_and_code_required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: employees, error } = await supabase
    .from("employees")
    .select("*, roles(id, name)")
    .ilike("email", email)
    .eq("access_code", code)
    .eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!employees?.length) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  if (!branchId) {
    const tenantIds = Array.from(new Set(employees.map((employee: any) => employee.tenant_id)));
    if (tenantIds.length > 1) {
      return NextResponse.json({ error: "multiple_employee_matches" }, { status: 409 });
    }
  }

  const branchResult = await resolveBranch(employees[0], branchId || undefined);
  if ("error" in branchResult && branchResult.error) {
    return NextResponse.json({ error: branchResult.error }, { status: 400 });
  }
  if (branchResult.status === "branch_required") {
    return NextResponse.json({
      status: "branch_required",
      employee: {
        id: employees[0].id,
        name: employees[0].name,
        email: employees[0].email,
        role: employees[0].roles?.name || employees[0].role,
      },
      branches: branchResult.branches,
      message: branchResult.message,
    });
  }

  const branch = branchResult.branch;
  if (!branch) return NextResponse.json({ error: "branch_not_found" }, { status: 404 });
  const employee = employees[0];
  const role = employee.roles?.name || employee.role || "Empleado";
  const token = createStaffToken({
    employeeId: employee.id,
    tenantId: employee.tenant_id,
    branchId: branch.id,
    branchName: branch.name,
    name: employee.name,
    email: employee.email,
    role,
    roleId: employee.role_id,
  });

  const latestAttendance = await getLatestAttendance(employee.id, employee.tenant_id);
  const response = NextResponse.json({
    authenticated: true,
    session: {
      employeeId: employee.id,
      tenantId: employee.tenant_id,
      branchId: branch.id,
      branchName: branch.name,
      name: employee.name,
      email: employee.email,
      role,
      roleId: employee.role_id,
    },
    latestAttendance,
    openAttendance: latestAttendance && !latestAttendance.clock_out_at ? latestAttendance : null,
  });

  response.cookies.set(STAFF_COOKIE, token, cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(STAFF_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
