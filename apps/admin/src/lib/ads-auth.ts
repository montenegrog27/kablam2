import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export type AdminUser = {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  role: string;
};

export function createSupabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function getAdminUser(req: NextRequest, allowedRoles = ["owner", "manager", "admin"]) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "unauthorized" as const };
  }

  const supabase = createSupabaseService();
  const token = authHeader.slice("Bearer ".length);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return { error: "unauthorized" as const };
  }

  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .select("id, tenant_id, branch_id, role")
    .eq("id", authData.user.id)
    .single();

  if (userError || !userRecord?.tenant_id) {
    return { error: "user_without_tenant" as const };
  }

  const user = userRecord as AdminUser;
  if (!allowedRoles.includes(user.role)) {
    return { error: "forbidden" as const };
  }

  return { supabase, user, authUser: authData.user };
}

export function authErrorStatus(error: "unauthorized" | "forbidden" | "user_without_tenant" | undefined) {
  if (error === "forbidden") return 403;
  if (error === "user_without_tenant") return 403;
  return 401;
}
