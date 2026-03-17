import { supabase } from "@kablam/supabase";

export async function POST(req: Request) {
  const body = await req.json();

  const { name, phone, address, items, total } = body;

  // 1. Crear orden
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_name: name,
      customer_phone: phone,
      address,
      total,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return Response.json({ success: false, error });
  }

  // 2. Insertar items
  const itemsToInsert = items.map((i: any) => ({
    order_id: order.id,
    product_id: i.productId,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
  }));

  await supabase.from("order_items").insert(itemsToInsert);

  return Response.json({ success: true, orderId: order.id });
}