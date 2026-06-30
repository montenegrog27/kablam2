import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { resolveAdminTenantFromHost } from "@/lib/admin-tenant-resolution";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function getRequestHost(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    ""
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const host = getRequestHost(req);
    const hostTenant = await resolveAdminTenantFromHost(supabase, host);

    const { data: currentUser, error: userError } = await supabase
      .from("users")
      .select("*, tenants(*), roles(role_permissions(permissions(key)))")
      .eq("id", authData.user.id)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    if (!hostTenant) {
      return NextResponse.json({
        user: currentUser,
        tenant: currentUser.tenants,
        switched: false,
        reason: "host_not_bound",
      });
    }

    if (currentUser.tenant_id === hostTenant.id) {
      return NextResponse.json({
        user: currentUser,
        tenant: currentUser.tenants,
        switched: false,
        reason: "already_active",
      });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("user_tenant_memberships")
      .select("tenant_id, branch_id, role")
      .eq("user_id", authData.user.id)
      .eq("tenant_id", hostTenant.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        {
          error: "membership_lookup_failed",
          details: membershipError.message,
          setupFile: "add_user_tenant_memberships.sql",
        },
        { status: 500 },
      );
    }

    if (!membership) {
      return NextResponse.json(
        {
          error: "tenant_access_denied",
          message: `Tu usuario no tiene acceso al tenant ${hostTenant.name}.`,
          hostTenant,
          activeTenant: currentUser.tenants,
        },
        { status: 403 },
      );
    }

    const { error: deactivateError } = await supabase
      .from("user_tenant_memberships")
      .update({ is_active: false })
      .eq("user_id", authData.user.id);

    if (deactivateError) {
      return NextResponse.json(
        { error: "membership_switch_failed", details: deactivateError.message },
        { status: 500 },
      );
    }

    const { error: activateError } = await supabase
      .from("user_tenant_memberships")
      .update({ is_active: true })
      .eq("user_id", authData.user.id)
      .eq("tenant_id", hostTenant.id);

    if (activateError) {
      return NextResponse.json(
        { error: "membership_switch_failed", details: activateError.message },
        { status: 500 },
      );
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({
        tenant_id: membership.tenant_id,
        branch_id: membership.branch_id,
        role: membership.role,
      })
      .eq("id", authData.user.id)
      .select("*, tenants(*), roles(role_permissions(permissions(key)))")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "user_switch_failed", details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      user: updatedUser,
      tenant: updatedUser.tenants,
      switched: true,
      reason: "host_tenant_applied",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "internal_error", details: error.message },
      { status: 500 },
    );
  }
}
