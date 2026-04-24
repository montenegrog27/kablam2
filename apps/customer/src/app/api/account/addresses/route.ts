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

    // Obtener direcciones del cliente
    const { data: addresses, error } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", session.customerId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching addresses:", error);
      return NextResponse.json(
        { error: "Error al cargar direcciones" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      addresses: addresses || [],
    });
  } catch (error: unknown) {
    console.error("Error en addresses GET:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
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
    const { alias, address, apartment, floor, notes, is_default } = body;

    // Validaciones
    if (!alias || !address) {
      return NextResponse.json(
        { error: "Alias y dirección son requeridos" },
        { status: 400 },
      );
    }

    // Si esta dirección será la predeterminada, quitar predeterminada de las otras
    if (is_default) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", session.customerId);
    }

    // Crear nueva dirección
    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({
        customer_id: session.customerId,
        alias,
        address,
        apartment: apartment || null,
        floor: floor || null,
        notes: notes || null,
        is_default: is_default || false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating address:", error);
      return NextResponse.json(
        { error: "Error al crear dirección" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Dirección creada",
      address: data,
    });
  } catch (error: unknown) {
    console.error("Error en addresses POST:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
