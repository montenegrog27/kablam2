import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SUPERADMIN_EMAIL =
  process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com";

export async function POST(req: NextRequest) {
  try {
    // Crear cliente de servicio (bypass RLS)
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // Obtener sesión del usuario desde cookies
    const authHeader = req.headers.get("authorization");
    let userEmail: string | undefined;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      // Verificar token con Supabase Auth
      const { data: userData, error: userError } =
        await supabaseService.auth.getUser(token);
      if (!userError && userData?.user?.email) {
        userEmail = userData.user.email;
      }
    } else {
      // Intentar obtener usuario desde cookies (Next.js/ Supabase SSR)
      const { data: userData } = await supabaseService.auth.getUser();
      if (userData?.user?.email) {
        userEmail = userData.user.email;
      }
    }

    // Verificar que el usuario sea SuperAdmin
    if (userEmail !== SUPERADMIN_EMAIL) {
      return NextResponse.json(
        { error: "No autorizado. Solo SuperAdmin puede crear usuarios." },
        { status: 403 },
      );
    }

    // Parsear body
    const body = await req.json();
    let { tenant_id, branch_id, email, name, role } = body;

    if (!tenant_id || !email || !role) {
      return NextResponse.json(
        {
          error: "Faltan campos requeridos: tenant_id, email, role",
        },
        { status: 400 },
      );
    }

    // Normalizar branch_id: si es string vacía, convertir a null
    if (branch_id && typeof branch_id === "string" && branch_id.trim() === "") {
      branch_id = null;
    }

    // Validar role
    const validRoles = ["owner", "admin", "cashier"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Rol inválido. Debe ser: owner, admin, cashier" },
        { status: 400 },
      );
    }

    // 1. Verificar que el usuario existe en auth.users
    const { data: authUsers, error: listError } =
      await supabaseService.auth.admin.listUsers({
        perPage: 1,
        page: 1,
      });
    if (listError) {
      console.error("Error listando usuarios de auth:", listError);
      return NextResponse.json(
        {
          error: "Error al verificar usuario en auth",
          details: listError.message,
        },
        { status: 500 },
      );
    }

    const authUser = authUsers.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!authUser) {
      return NextResponse.json(
        {
          error:
            "El usuario no existe en Supabase Auth. Debes crearlo primero en el dashboard de Supabase (Authentication → Users).",
        },
        { status: 404 },
      );
    }
    if (!authUser) {
      return NextResponse.json(
        {
          error:
            "El usuario no existe en Supabase Auth. Debes crearlo primero en el dashboard de Supabase (Authentication → Users).",
        },
        { status: 404 },
      );
    }

    // 2. Verificar que no esté ya registrado en la tabla users
    const { data: existingUser, error: existingError } = await supabaseService
      .from("users")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (existingError) {
      console.error("Error verificando usuario existente:", existingError);
      return NextResponse.json(
        {
          error: "Error al verificar usuario existente",
          details: existingError.message,
        },
        { status: 500 },
      );
    }

    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "El usuario ya está registrado en la tabla users (ya tiene tenant/branch asignado).",
        },
        { status: 409 },
      );
    }

    // 3. Insertar en tabla users
    const { data: newUser, error: insertError } = await supabaseService
      .from("users")
      .insert({
        id: authUser.id,
        name: name || email.split("@")[0],
        email,
        role,
        tenant_id,
        branch_id: branch_id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error insertando usuario:", insertError);
      return NextResponse.json(
        { error: "Error al crear usuario", details: insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Usuario creado exitosamente",
      user: newUser,
    });
  } catch (error: any) {
    console.error("Error en API superadmin/users:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 },
    );
  }
}
