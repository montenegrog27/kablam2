import { supabaseBrowser as supabase } from "@kablam/supabase/client";

type ErrorContext = {
  tenantId?: string | null;
  branchId?: string | null;
  code?: string;
  context?: Record<string, unknown>;
};

export async function logAppError(
  app: string,
  message: string,
  options: ErrorContext = {},
) {
  try {
    await supabase.rpc("log_app_error", {
      p_app: app,
      p_message: message,
      p_severity: "error",
      p_code: options.code || null,
      p_context: options.context || {},
      p_tenant_id: options.tenantId || null,
      p_branch_id: options.branchId || null,
    });
  } catch {
    // Avoid cascading failures from observability itself.
  }
}
