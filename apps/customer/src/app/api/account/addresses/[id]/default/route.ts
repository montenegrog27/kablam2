import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/customer-session";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const session = await getCustomerSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const resolvedParams = await params;
    const addressId = resolvedParams.id;

    // Verificar que la dirección pertenece al cliente
    const { data: existingAddress } = await supabase
      .from("customer_addresses")
      .select("id")
      .eq("id", addressId)
      .eq("customer_id", session.customerId)
      .single();

    if (!existingAddress) {
      return NextResponse.json(
        { error: "Dirección no encontrada o no autorizada" },
        { status: 404 },
      );
    }

    // Quitar predeterminada de todas las direcciones del cliente
    await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", session.customerId);

    // Establecer esta dirección como predeterminada
    const { data, error } = await supabase
      .from("customer_addresses")
      .update({
        is_default: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", addressId)
      .select()
      .single();

    if (error) {
      console.error("Error setting default address:", error);
      return NextResponse.json(
        { error: "Error al establecer dirección predeterminada" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Dirección establecida como predeterminada",
      address: data,
    });
  } catch (error: unknown) {
    console.error("Error en set default address:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
