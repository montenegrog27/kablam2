import { createClient } from "@supabase/supabase-js";

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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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
