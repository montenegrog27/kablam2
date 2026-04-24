import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/customer-session";

interface SupabaseOrder {
  id: string;
  order_number?: string;
  status: string;
  type: string;
  total: number;
  subtotal: number;
  shipping_cost?: number;
  discount?: number;
  address?: string;
  customer_notes?: string;
  created_at: string;
  order_items?: SupabaseOrderItem[];
  customer_name?: string;
  customer_phone?: string;
}

interface SupabaseOrderItem {
  id: string;
  product?: { name?: string };
  variant?: { name?: string };
  quantity: number;
  unit_price: number;
  total: number;
  notes?: string;
}

interface SupabaseOrderItemRaw {
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  notes?: string;
}

interface SupabaseOrderRaw extends Omit<SupabaseOrder, "order_items"> {
  order_items?: SupabaseOrderItemRaw[];
}

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const session = await getCustomerSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Obtener parámetros de paginación
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    // Obtener pedidos del cliente
    const {
      data: orders,
      error,
      count,
    } = await supabase
      .from("orders")
      .select(
        `
        *,
        order_items (
          id,
          product:products(name),
          variant:product_variants(name),
          quantity,
          unit_price,
          total,
          notes
        )
      `,
        { count: "exact" },
      )
      .eq("customer_id", session.customerId)
      .eq("branch_id", session.branchId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching orders:", error);
      return NextResponse.json(
        { error: "Error al cargar pedidos" },
        { status: 500 },
      );
    }

    // Formatear respuesta
    const formattedOrders = (orders || []).map((order: SupabaseOrder) => ({
      id: order.id,
      order_number:
        order.order_number || `ORD-${order.id.slice(-6).toUpperCase()}`,
      status: order.status,
      type: order.type,
      total: order.total,
      subtotal: order.subtotal,
      shipping_cost: order.shipping_cost,
      discount: order.discount,
      address: order.address,
      customer_notes: order.customer_notes,
      created_at: order.created_at,
      items: (order.order_items || []).map((item: SupabaseOrderItem) => ({
        id: item.id,
        product_name: item.product?.name || item.variant?.name || "Producto",
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        notes: item.notes,
      })),
    }));

    return NextResponse.json({
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: unknown) {
    console.error("Error en orders GET:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// Endpoint para reordenar
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
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: "ID de pedido requerido" },
        { status: 400 },
      );
    }

    // Obtener el pedido original
    const { data, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        *,
        order_items (
          product_id,
          variant_id,
          quantity,
          unit_price,
          notes
        )
      `,
      )
      .eq("id", orderId)
      .eq("customer_id", session.customerId)
      .single();

    const originalOrder = data as SupabaseOrderRaw;
    if (orderError || !originalOrder) {
      return NextResponse.json(
        { error: "Pedido no encontrado o no autorizado" },
        { status: 404 },
      );
    }

    // Crear un nuevo pedido basado en el original
    const { data: newOrderData, error: createError } = await supabase
      .from("orders")
      .insert({
        tenant_id: session.tenantId,
        branch_id: session.branchId,
        customer_id: session.customerId,
        sales_channel: "customer",
        status: "unconfirmed",
        type: originalOrder.type,
        customer_name: originalOrder.customer_name,
        customer_phone: originalOrder.customer_phone,
        address: originalOrder.address,
        customer_notes: `Reordenado desde pedido #${originalOrder.order_number || originalOrder.id.slice(-6).toUpperCase()}`,
        subtotal: originalOrder.subtotal,
        total: originalOrder.total,
        shipping_cost: originalOrder.shipping_cost,
        discount: 0, // Reiniciar descuentos
        paid_amount: 0,
        is_paid: false,
      })
      .select()
      .single();

    const newOrder = newOrderData as SupabaseOrderRaw;
    if (createError || !newOrder) {
      console.error("Error creating reorder:", createError);
      return NextResponse.json(
        { error: "Error al crear reorden" },
        { status: 500 },
      );
    }

    // Copiar los items del pedido original
    const orderItems = (originalOrder.order_items || []).map(
      (item: SupabaseOrderItemRaw) => ({
        order_id: newOrder.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
        notes: item.notes,
      }),
    );

    if (orderItems.length > 0) {
      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Error copying order items:", itemsError);
        // Continuar aunque falle, el pedido ya se creó
      }
    }

    return NextResponse.json({
      success: true,
      message: "Pedido reordenado",
      orderId: newOrder.id,
      cartItems: orderItems.map((item: (typeof orderItems)[0]) => ({
        variantId: item.variant_id,
        quantity: item.quantity,
        notes: item.notes,
      })),
    });
  } catch (error: unknown) {
    console.error("Error en orders POST:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
