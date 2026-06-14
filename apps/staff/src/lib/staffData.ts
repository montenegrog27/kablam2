import { supabaseAdmin } from "./supabaseAdmin";

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeCode(value: unknown) {
  return String(value || "").trim();
}

export function isWaiterRole(role: unknown) {
  return String(role || "").trim().toLowerCase() === "mozo";
}

export function isAdminRole(role: unknown) {
  return String(role || "").trim().toLowerCase() === "admin";
}

export function canManageTables(role: unknown) {
  return isWaiterRole(role) || isAdminRole(role);
}

export async function getLatestAttendance(employeeId: string, tenantId: string) {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("employee_attendances")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

export async function getOpenAttendance(employeeId: string, tenantId: string) {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("employee_attendances")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}
