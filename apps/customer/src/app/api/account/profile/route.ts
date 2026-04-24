import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/customer-session";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const session = await getCustomerSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Obtener datos del cliente
    const { data: customer, error } = await supabase
      .from("customers")
      .select("id, name, email, phone, birth_date, created_at")
      .eq("id", session.customerId)
      .single();

    if (error) {
      console.error("Error fetching customer:", error);
      return NextResponse.json(
        { error: "Error al cargar perfil" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      birthDate: customer.birth_date,
      createdAt: customer.created_at,
    });
  } catch (error: unknown) {
    console.error("Error en profile GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const session = await getCustomerSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { name, email, birthDate } = body;

    // Validaciones básicas
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    // Validar fecha de nacimiento si se proporciona
    let birthDateValidated = null;
    if (birthDate) {
      const date = new Date(birthDate);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: "Fecha de nacimiento inválida" },
          { status: 400 },
        );
      }
      // Asegurar que no sea fecha futura
      if (date > new Date()) {
        return NextResponse.json(
          { error: "La fecha de nacimiento no puede ser futura" },
          { status: 400 },
        );
      }
      birthDateValidated = date.toISOString().split("T")[0]; // Formato YYYY-MM-DD
    }

    // Actualizar cliente
    const { data, error } = await supabase
      .from("customers")
      .update({
        name: name || null,
        email: email || null,
        birth_date: birthDateValidated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.customerId)
      .select("id, name, email, phone, birth_date")
      .single();

    if (error) {
      console.error("Error updating customer:", error);
      return NextResponse.json(
        { error: "Error al actualizar perfil" },
        { status: 500 },
      );
    }

    // Actualizar sesión si el nombre cambió
    if (name && session.name !== name) {
      // En una implementación real, deberíamos actualizar la cookie de sesión
      // Por ahora, solo devolvemos los datos actualizados
    }

    return NextResponse.json({
      success: true,
      message: "Perfil actualizado",
      customer: {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        birthDate: data.birth_date,
      },
    });
  } catch (error: unknown) {
    console.error("Error en profile PUT:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
