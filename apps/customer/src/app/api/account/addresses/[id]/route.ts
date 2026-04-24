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
    const body = await req.json();
    const { alias, address, apartment, floor, notes, is_default } = body;

    // Validaciones
    if (!alias || !address) {
      return NextResponse.json(
        { error: "Alias y dirección son requeridos" },
        { status: 400 },
      );
    }

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

    // Si esta dirección será la predeterminada, quitar predeterminada de las otras
    if (is_default) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", session.customerId);
    }

    // Actualizar dirección
    const { data, error } = await supabase
      .from("customer_addresses")
      .update({
        alias,
        address,
        apartment: apartment || null,
        floor: floor || null,
        notes: notes || null,
        is_default: is_default || false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", addressId)
      .select()
      .single();

    if (error) {
      console.error("Error updating address:", error);
      return NextResponse.json(
        { error: "Error al actualizar dirección" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Dirección actualizada",
      address: data,
    });
  } catch (error: unknown) {
    console.error("Error en address PUT:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
      .select("id, is_default")
      .eq("id", addressId)
      .eq("customer_id", session.customerId)
      .single();

    if (!existingAddress) {
      return NextResponse.json(
        { error: "Dirección no encontrada o no autorizada" },
        { status: 404 },
      );
    }

    // No permitir eliminar la dirección predeterminada si es la única
    if (existingAddress.is_default) {
      const { count } = await supabase
        .from("customer_addresses")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", session.customerId);

      if (count && count <= 1) {
        return NextResponse.json(
          { error: "No se puede eliminar la única dirección predeterminada" },
          { status: 400 },
        );
      }
    }

    // Eliminar dirección
    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", addressId);

    if (error) {
      console.error("Error deleting address:", error);
      return NextResponse.json(
        { error: "Error al eliminar dirección" },
        { status: 500 },
      );
    }

    // Si era la predeterminada, establecer otra como predeterminada
    if (existingAddress.is_default) {
      const { data: otherAddress } = await supabase
        .from("customer_addresses")
        .select("id")
        .eq("customer_id", session.customerId)
        .limit(1)
        .single();

      if (otherAddress) {
        await supabase
          .from("customer_addresses")
          .update({ is_default: true })
          .eq("id", otherAddress.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Dirección eliminada",
    });
  } catch (error: unknown) {
    console.error("Error en address DELETE:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
