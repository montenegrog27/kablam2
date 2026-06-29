import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createSupabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getAuthorizedUser(req: NextRequest) {
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
    .select("id, tenant_id, role")
    .eq("id", authData.user.id)
    .single();

  if (userError || !userRecord?.tenant_id) {
    return { error: "user_without_tenant" as const };
  }

  if (!["owner", "manager", "admin"].includes(userRecord.role)) {
    return { error: "forbidden" as const };
  }

  return { supabase, user: userRecord };
}

async function validatePermissionIds(supabase: ReturnType<typeof createSupabaseService>, permissionIds: string[]) {
  if (permissionIds.length === 0) return true;

  const uniqueIds = [...new Set(permissionIds)];
  const { data, error } = await supabase.from("permissions").select("id").in("id", uniqueIds);

  return !error && (data || []).length === uniqueIds.length;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthorizedUser(req);
    if ("error" in auth) {
      const status = auth.error === "forbidden" ? 403 : 401;
      return NextResponse.json({ error: auth.error }, { status });
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const permissionIds = Array.isArray(body.permissionIds) ? body.permissionIds.map(String) : [];

    if (!name) {
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    }

    const validPermissions = await validatePermissionIds(auth.supabase, permissionIds);
    if (!validPermissions) {
      return NextResponse.json({ error: "invalid_permissions" }, { status: 400 });
    }

    const { data: role, error: roleError } = await auth.supabase
      .from("roles")
      .insert({
        tenant_id: auth.user.tenant_id,
        name,
        description: description || null,
      })
      .select()
      .single();

    if (roleError || !role) {
      return NextResponse.json({ error: "role_create_failed", details: roleError?.message }, { status: 500 });
    }

    const uniquePermissionIds = [...new Set(permissionIds)];
    if (uniquePermissionIds.length > 0) {
      const { error: permsError } = await auth.supabase
        .from("role_permissions")
        .insert(uniquePermissionIds.map((permission_id) => ({ role_id: role.id, permission_id })));

      if (permsError) {
        await auth.supabase.from("roles").delete().eq("id", role.id);
        return NextResponse.json({ error: "role_permissions_create_failed", details: permsError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ role });
  } catch (error) {
    return NextResponse.json(
      { error: "role_create_failed", details: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await getAuthorizedUser(req);
    if ("error" in auth) {
      const status = auth.error === "forbidden" ? 403 : 401;
      return NextResponse.json({ error: auth.error }, { status });
    }

    const body = await req.json();
    const roleId = String(body.roleId || "");
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const permissionIds = Array.isArray(body.permissionIds) ? body.permissionIds.map(String) : [];

    if (!roleId || !name) {
      return NextResponse.json({ error: "role_id_and_name_required" }, { status: 400 });
    }

    const { data: existingRole } = await auth.supabase
      .from("roles")
      .select("id, tenant_id")
      .eq("id", roleId)
      .single();

    if (!existingRole || existingRole.tenant_id !== auth.user.tenant_id) {
      return NextResponse.json({ error: "role_not_found" }, { status: 404 });
    }

    const validPermissions = await validatePermissionIds(auth.supabase, permissionIds);
    if (!validPermissions) {
      return NextResponse.json({ error: "invalid_permissions" }, { status: 400 });
    }

    const { error: updateError } = await auth.supabase
      .from("roles")
      .update({ name, description: description || null })
      .eq("id", roleId);

    if (updateError) {
      return NextResponse.json({ error: "role_update_failed", details: updateError.message }, { status: 500 });
    }

    const { error: deleteError } = await auth.supabase.from("role_permissions").delete().eq("role_id", roleId);
    if (deleteError) {
      return NextResponse.json({ error: "role_permissions_clear_failed", details: deleteError.message }, { status: 500 });
    }

    const uniquePermissionIds = [...new Set(permissionIds)];
    if (uniquePermissionIds.length > 0) {
      const { error: insertError } = await auth.supabase
        .from("role_permissions")
        .insert(uniquePermissionIds.map((permission_id) => ({ role_id: roleId, permission_id })));

      if (insertError) {
        return NextResponse.json({ error: "role_permissions_update_failed", details: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "role_update_failed", details: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthorizedUser(req);
    if ("error" in auth) {
      const status = auth.error === "forbidden" ? 403 : 401;
      return NextResponse.json({ error: auth.error }, { status });
    }

    const roleId = req.nextUrl.searchParams.get("roleId");
    if (!roleId) {
      return NextResponse.json({ error: "role_id_required" }, { status: 400 });
    }

    const { data: existingRole } = await auth.supabase
      .from("roles")
      .select("id, tenant_id")
      .eq("id", roleId)
      .single();

    if (!existingRole || existingRole.tenant_id !== auth.user.tenant_id) {
      return NextResponse.json({ error: "role_not_found" }, { status: 404 });
    }

    const { data: usersWithRole } = await auth.supabase.from("users").select("id").eq("role_id", roleId).limit(1);
    if (usersWithRole && usersWithRole.length > 0) {
      return NextResponse.json({ error: "role_in_use" }, { status: 409 });
    }

    const { error: deleteError } = await auth.supabase.from("roles").delete().eq("id", roleId);
    if (deleteError) {
      return NextResponse.json({ error: "role_delete_failed", details: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "role_delete_failed", details: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
