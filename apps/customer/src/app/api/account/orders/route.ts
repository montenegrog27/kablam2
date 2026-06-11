import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/customer-session";

type OrderStatus =
  | "unconfirmed"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

type OrderItemExtra = {
  type?: "extra" | "sin" | string;
  name?: string;
  price?: number;
};

type SupabaseOrderItem = {
  id: string;
  product_id?: string;
  combo_id?: string;
  variant_id?: string;
  products?: { name?: string } | null;
  combos?: { name?: string } | null;
  variant?: { id?: string; name?: string; price?: number; is_default?: boolean } | null;
  quantity: number;
  unit_price: number;
  total: number;
  note?: string;
  extras?: OrderItemExtra[];
  order_id?: string;
};

type SupabaseOrder = {
  id: string;
  order_number?: string;
  status: OrderStatus;
  type: "delivery" | "takeaway" | "pickup" | "dine_in";
  total: number;
  subtotal: number;
  shipping_cost?: number;
  discount?: number;
  address?: string;
  customer_notes?: string;
  created_at: string;
  order_items?: SupabaseOrderItem[];
};

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

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    const {
      data: orders,
      error,
      count,
    } = await supabase
      .from("orders")
      .select("*", { count: "exact" })
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

    const orderIds = ((orders || []) as SupabaseOrder[]).map((order) => order.id);
    const { data: orderItems, error: itemsError } = orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("id, order_id, product_id, combo_id, variant_id, quantity, unit_price, total, note, extras, products(name), combos(name)")
          .in("order_id", orderIds)
      : { data: [] as SupabaseOrderItem[], error: null };

    if (itemsError) {
      console.error("Error fetching order items:", itemsError);
    }

    const itemsByOrder = new Map<string, SupabaseOrderItem[]>();
    ((orderItems || []) as SupabaseOrderItem[]).forEach((item) => {
      if (!item.order_id) return;
      const current = itemsByOrder.get(item.order_id) || [];
      current.push(item);
      itemsByOrder.set(item.order_id, current);
    });

    const formattedOrders = ((orders || []) as SupabaseOrder[]).map((order) => ({
      id: order.id,
      order_number:
        order.order_number || `ORD-${order.id.slice(-6).toUpperCase()}`,
      status: order.status,
      type: order.type,
      total: order.total,
      subtotal: order.subtotal,
      shipping_cost: order.shipping_cost || 0,
      discount: order.discount || 0,
      address: order.address,
      customer_notes: order.customer_notes,
      created_at: order.created_at,
      items: (itemsByOrder.get(order.id) || []).map((item) => ({
        id: item.id,
        product_id: item.product_id,
        combo_id: item.combo_id,
        variant_id: item.variant_id,
        product_name: item.products?.name || item.combos?.name || getPromotionName(item.extras) || "Producto",
        variant: null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        notes: item.note,
        extras: item.extras || [],
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

function getPromotionName(extras?: OrderItemExtra[]) {
  const promotion = (extras || []).find((extra) => extra.type === "promotion");
  return promotion?.name;
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

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { error: "ID de pedido requerido" },
        { status: 400 },
      );
    }

    const { data: originalOrder, error: orderError } = await supabase
      .from("orders")
      .select("*, order_items!left(*)")
      .eq("id", orderId)
      .eq("customer_id", session.customerId)
      .eq("branch_id", session.branchId)
      .single();

    if (orderError || !originalOrder) {
      return NextResponse.json(
        { error: "Pedido no encontrado o no autorizado" },
        { status: 404 },
      );
    }

    const order = originalOrder as SupabaseOrder;
    const now = Date.now();

    return NextResponse.json({
      success: true,
      message: "Carrito reconstruido",
      orderMode: order.type === "takeaway" || order.type === "pickup" ? "takeaway" : "delivery",
      customer: {
        address: order.address,
      },
      cartItems: (order.order_items || []).map((item) => ({
        uid: `reorder-${item.id}-${now}`,
        variantId: item.variant_id || "",
        productId: item.product_id || "",
        name: item.products?.name || item.combos?.name || item.variant?.name || getPromotionName(item.extras) || "Producto",
        price: item.unit_price,
        quantity: item.quantity,
        variant: {
          id: item.variant_id || "",
          name: item.variant?.name || "Producto",
          price: item.unit_price,
          is_default: item.variant?.is_default ?? true,
        },
        extras: (item.extras || [])
          .filter((extra) => extra.type === "extra")
          .map((extra) => ({
            id: extra.name || "extra",
            name: extra.name || "Extra",
            price: extra.price || 0,
          })),
        removedIngredients: (item.extras || [])
          .filter((extra) => extra.type === "sin")
          .map((extra) => ({
            id: extra.name || "sin",
            name: extra.name || "Ingrediente",
          })),
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
