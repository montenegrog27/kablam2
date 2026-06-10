import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function cleanCode(value: unknown) {
  return String(value || "").trim();
}

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function GET() {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, tenant_id, name")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branches: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = String(body.action || "status");
  const branchId = String(body.branchId || "");
  const email = cleanEmail(body.email);
  const code = cleanCode(body.code);

  if (!email || !code) {
    return NextResponse.json({ error: "email_and_code_required" }, { status: 400 });
  }

  const supabase = serviceClient();
  const { data: employees, error: employeeError } = await supabase
    .from("employees")
    .select("*, roles(id, name)")
    .ilike("email", email)
    .eq("access_code", code)
    .eq("is_active", true);

  if (employeeError) return NextResponse.json({ error: employeeError.message }, { status: 500 });
  if (!employees?.length) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  let selectedBranch: { id: string; tenant_id: string; name: string } | null = null;
  if (branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id, name")
      .eq("id", branchId)
      .maybeSingle();
    if (!branch?.tenant_id) return NextResponse.json({ error: "branch_not_found" }, { status: 404 });
    selectedBranch = branch;
  }

  const matchingEmployees = selectedBranch
    ? employees.filter(
        (employee) =>
          employee.tenant_id === selectedBranch?.tenant_id &&
          (!employee.branch_id || employee.branch_id === selectedBranch?.id),
      )
    : employees;

  if (!matchingEmployees.length) {
    return NextResponse.json({ error: "invalid_branch_for_employee" }, { status: 403 });
  }

  if (!selectedBranch && matchingEmployees.length > 1) {
    const tenantIds = Array.from(new Set(matchingEmployees.map((employee) => employee.tenant_id)));
    if (tenantIds.length > 1) {
      return NextResponse.json({ error: "multiple_employee_matches" }, { status: 409 });
    }
  }

  const employee = matchingEmployees[0];

  if (!selectedBranch && employee.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id, tenant_id, name")
      .eq("id", employee.branch_id)
      .maybeSingle();
    if (!branch?.tenant_id) return NextResponse.json({ error: "branch_not_found" }, { status: 404 });
    selectedBranch = branch;
  }

  if (!selectedBranch) {
    const { data: branches, error: branchesError } = await supabase
      .from("branches")
      .select("id, tenant_id, name")
      .eq("tenant_id", employee.tenant_id)
      .order("name");

    if (branchesError) return NextResponse.json({ error: branchesError.message }, { status: 500 });

    if ((branches || []).length === 1) {
      selectedBranch = branches![0];
    } else {
      return NextResponse.json({
        employee,
        branches: branches || [],
        status: "branch_required",
        message: "Elegí la sucursal para registrar tu turno.",
      });
    }
  }

  const branch = selectedBranch;

  const { data: openAttendance } = await supabase
    .from("employee_attendances")
    .select("*")
    .eq("tenant_id", branch.tenant_id)
    .eq("employee_id", employee.id)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (action === "clock_in") {
    if (openAttendance) {
      return NextResponse.json({
        employee,
        branch,
        openAttendance,
        status: "already_open",
        message: "Ya tenes un turno abierto.",
      });
    }

    const { data, error } = await supabase
      .from("employee_attendances")
      .insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        employee_id: employee.id,
        source: "staff_app",
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ employee, branch, openAttendance: data, status: "clocked_in" });
  }

  if (action === "clock_out") {
    if (!openAttendance) {
      return NextResponse.json({
        employee,
        branch,
        openAttendance: null,
        status: "no_open_shift",
        message: "No tenes un turno abierto.",
      });
    }

    const { data, error } = await supabase
      .from("employee_attendances")
      .update({ clock_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", openAttendance.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ employee, branch, closedAttendance: data, status: "clocked_out" });
  }

  return NextResponse.json({
    employee,
    branch,
    openAttendance,
    status: openAttendance ? "open" : "closed",
  });
}
