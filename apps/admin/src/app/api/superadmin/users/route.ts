import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SUPERADMIN_EMAIL =
  process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com";

const VALID_ROLES = ["owner", "manager", "admin", "cashier"];

type TenantMembershipInput = {
  tenant_id: string;
  branch_id?: string | null;
  role: string;
  is_active?: boolean;
};

type NormalizedMembership = {
  tenant_id: string;
  branch_id: string | null;
  role: string;
  is_active: boolean;
};

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

async function getRequesterEmail(req: NextRequest, supabaseService: SupabaseClient) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return undefined;

  const token = authHeader.substring(7);
  const { data, error } = await supabaseService.auth.getUser(token);
  if (error) return undefined;

  return data.user?.email || undefined;
}

async function assertSuperAdmin(req: NextRequest, supabaseService: SupabaseClient) {
  const email = await getRequesterEmail(req, supabaseService);
  return email === SUPERADMIN_EMAIL;
}

async function findAuthUserByEmail(supabaseService: SupabaseClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseService.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === normalizedEmail,
    );
    if (match) return match;
    if (data.users.length < 100) break;
  }

  return null;
}

function normalizeMemberships(
  rawMemberships: TenantMembershipInput[] | undefined,
  fallback: TenantMembershipInput,
) {
  const source = Array.isArray(rawMemberships) && rawMemberships.length > 0
    ? rawMemberships
    : [fallback];

  const byTenant = new Map<string, NormalizedMembership>();

  for (const item of source) {
    const tenantId = String(item.tenant_id || "").trim();
    const role = String(item.role || "").trim();
    const branchId = String(item.branch_id || "").trim() || null;

    if (!tenantId || !role) continue;
    if (!VALID_ROLES.includes(role)) {
      throw new Error("Rol invalido. Debe ser: owner, manager, admin, cashier");
    }

    byTenant.set(tenantId, {
      tenant_id: tenantId,
      branch_id: branchId,
      role,
      is_active: Boolean(item.is_active),
    });
  }

  const memberships = Array.from(byTenant.values());
  if (memberships.length === 0) {
    throw new Error("El usuario debe tener al menos un tenant asignado.");
  }

  const activeIndex = memberships.findIndex((item) => item.is_active);
  memberships.forEach((item, index) => {
    item.is_active = activeIndex >= 0 ? index === activeIndex : index === 0;
  });

  return memberships;
}

async function validateMemberships(
  supabaseService: SupabaseClient,
  memberships: NormalizedMembership[],
) {
  const tenantIds = memberships.map((item) => item.tenant_id);
  const { data: tenants, error: tenantsError } = await supabaseService
    .from("tenants")
    .select("id")
    .in("id", tenantIds);

  if (tenantsError) throw tenantsError;
  if ((tenants || []).length !== tenantIds.length) {
    throw new Error("Uno o mas tenants seleccionados no existen.");
  }

  for (const membership of memberships) {
    if (!membership.branch_id) continue;

    const { data: branch, error: branchError } = await supabaseService
      .from("branches")
      .select("id")
      .eq("id", membership.branch_id)
      .eq("tenant_id", membership.tenant_id)
      .maybeSingle();

    if (branchError) throw branchError;
    if (!branch) {
      throw new Error("Una sucursal seleccionada no pertenece a su tenant.");
    }
  }
}

async function syncTenantMemberships(
  supabaseService: SupabaseClient,
  userId: string,
  memberships: NormalizedMembership[],
) {
  await validateMemberships(supabaseService, memberships);

  const activeMembership =
    memberships.find((membership) => membership.is_active) || memberships[0];

  const { error: deactivateError } = await supabaseService
    .from("user_tenant_memberships")
    .update({ is_active: false })
    .eq("user_id", userId);

  if (deactivateError) throw deactivateError;

  const { error: upsertError } = await supabaseService
    .from("user_tenant_memberships")
    .upsert(
      memberships.map((membership) => ({
        user_id: userId,
        tenant_id: membership.tenant_id,
        branch_id: membership.branch_id,
        role: membership.role,
        is_active: membership.is_active,
      })),
      { onConflict: "user_id,tenant_id" },
    );

  if (upsertError) throw upsertError;

  const { error: deleteError } = await supabaseService
    .from("user_tenant_memberships")
    .delete()
    .eq("user_id", userId)
    .not("tenant_id", "in", `(${memberships.map((item) => item.tenant_id).join(",")})`);

  if (deleteError) throw deleteError;

  return activeMembership;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseService = createServiceClient();

    if (!(await assertSuperAdmin(req, supabaseService))) {
      return NextResponse.json(
        { error: "No autorizado. Solo SuperAdmin puede crear usuarios." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const tenantId = String(body.tenant_id || "").trim();
    const branchId = String(body.branch_id || "").trim() || null;
    const email = String(body.email || "").trim();
    const name = String(body.name || "").trim();
    const role = String(body.role || "").trim();

    if (!tenantId || !email || !role) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: tenant_id, email, role" },
        { status: 400 },
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Rol invalido. Debe ser: owner, manager, admin, cashier" },
        { status: 400 },
      );
    }

    const authUser = await findAuthUserByEmail(supabaseService, email);
    if (!authUser) {
      return NextResponse.json(
        {
          error:
            "El usuario no existe en Supabase Auth. Debes crearlo primero en Authentication > Users.",
        },
        { status: 404 },
      );
    }

    const { data: existingUser, error: existingError } = await supabaseService
      .from("users")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "Error al verificar usuario existente", details: existingError.message },
        { status: 500 },
      );
    }

    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "El usuario ya esta registrado. Editalo para agregarle mas tenants.",
        },
        { status: 409 },
      );
    }

    const memberships = normalizeMemberships(undefined, {
      tenant_id: tenantId,
      branch_id: branchId,
      role,
      is_active: true,
    });

    await validateMemberships(supabaseService, memberships);

    const { data: newUser, error: insertError } = await supabaseService
      .from("users")
      .insert({
        id: authUser.id,
        name: name || email.split("@")[0],
        role,
        tenant_id: tenantId,
        branch_id: branchId,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Error al crear usuario", details: insertError.message },
        { status: 500 },
      );
    }

    try {
      await syncTenantMemberships(supabaseService, authUser.id, memberships);
    } catch (error: any) {
      return NextResponse.json(
        {
          error: "Usuario creado, pero no se pudo crear el acceso multi-tenant.",
          details: error.message,
          setupFile: "add_user_tenant_memberships.sql",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Usuario creado exitosamente",
      user: newUser,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabaseService = createServiceClient();

    if (!(await assertSuperAdmin(req, supabaseService))) {
      return NextResponse.json(
        { error: "No autorizado. Solo SuperAdmin puede editar usuarios." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const userId = String(body.user_id || "").trim();
    const name = String(body.name || "").trim();
    const role = String(body.role || "").trim();
    const tenantId = String(body.tenant_id || "").trim();
    const branchId = String(body.branch_id || "").trim() || null;

    if (!userId || !tenantId || !name || !role) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: user_id, tenant_id, name, role" },
        { status: 400 },
      );
    }

    let memberships: NormalizedMembership[];
    try {
      memberships = normalizeMemberships(body.tenant_memberships, {
        tenant_id: tenantId,
        branch_id: branchId,
        role,
        is_active: true,
      });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let activeMembership: NormalizedMembership;
    try {
      activeMembership = await syncTenantMemberships(
        supabaseService,
        userId,
        memberships,
      );
    } catch (error: any) {
      return NextResponse.json(
        {
          error: "Error al guardar accesos multi-tenant",
          details: error.message,
          setupFile: "add_user_tenant_memberships.sql",
        },
        { status: 500 },
      );
    }

    const { data, error } = await supabaseService
      .from("users")
      .update({
        name,
        role: activeMembership.role,
        tenant_id: activeMembership.tenant_id,
        branch_id: activeMembership.branch_id,
      })
      .eq("id", userId)
      .select("*, tenants(name), branches(name)")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Error al actualizar usuario", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Usuario actualizado exitosamente",
      user: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 },
    );
  }
}
