import { NextRequest, NextResponse } from "next/server";
import { getOpenAttendance } from "@/lib/staffData";
import { getStaffSession } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = String(body.action || "status");
  const supabase = supabaseAdmin();
  const openAttendance = await getOpenAttendance(session.employeeId, session.tenantId);

  if (action === "clock_in") {
    if (openAttendance) {
      return NextResponse.json({
        session,
        openAttendance,
        status: "already_open",
        message: "Ya tenes un turno abierto.",
      });
    }

    const { data, error } = await supabase
      .from("employee_attendances")
      .insert({
        tenant_id: session.tenantId,
        branch_id: session.branchId,
        employee_id: session.employeeId,
        source: "staff_pwa",
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session, openAttendance: data, status: "clocked_in" });
  }

  if (action === "clock_out") {
    if (!openAttendance) {
      return NextResponse.json({
        session,
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
    return NextResponse.json({ session, closedAttendance: data, status: "clocked_out" });
  }

  return NextResponse.json({
    session,
    openAttendance,
    status: openAttendance ? "open" : "closed",
  });
}
