import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  // Cargar orden
  const { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*, products(id, name, category_id, price))")
    .eq("id", orderId)
    .single();

  if (!order || !order.customer_id) return NextResponse.json({ error: "Order not found" });

  const customerId = order.customer_id;
  const tenantId = order.tenant_id;
  const total = order.total || 0;
  const items = order.order_items || [];

  // 1. Actualizar stats del customer
  await supabase.from("customers").update({
    lifetime_orders: supabase.rpc("increment", { x: 1 }),
    lifetime_spent: supabase.rpc("increment", { x: total }),
    last_order_at: new Date().toISOString(),
  }).eq("id", customerId);

  // 2. Cargar reglas de fidelización activas
  const { data: rules } = await supabase
    .from("loyalty_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (!rules?.length) return NextResponse.json({ ok: true });

  for (const rule of rules) {
    if (rule.type === "points") {
      // Sistema de puntos: cada $X = 1 punto
      const pointsEarned = Math.floor(total / (rule.points_per_amount || 1000));
      if (pointsEarned > 0) {
        await supabase.rpc("add_loyalty_points", {
          p_customer_id: customerId,
          p_points: pointsEarned,
        });

        await supabase.from("user_notifications").insert({
          customer_id: customerId,
          type: "points",
          title: `💰 ${pointsEarned} puntos ganados`,
          body: `Por tu compra de $${total.toLocaleString("es-AR")}`,
        });
      }
    } else if (rule.type === "product_accumulation") {
      // Sistema de acumulación: cada X productos = recompensa
      const matchingItems = items.filter((item: any) => {
        const product = item.products;
        if (!product) return false;
        if (rule.product_id && product.id !== rule.product_id) return false;
        if (rule.category_id && product.category_id !== rule.category_id) return false;
        return true;
      });

      if (matchingItems.length === 0) continue;

      const totalQty = matchingItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);

      // Obtener o crear progreso
      const { data: progress } = await supabase
        .from("user_rewards_progress")
        .select("*")
        .eq("customer_id", customerId)
        .eq("rule_id", rule.id)
        .maybeSingle();

      const currentCount = (progress?.current_count || 0) + totalQty;
      const totalRequired = rule.required_quantity || 5;

      if (progress) {
        await supabase.from("user_rewards_progress").update({ current_count: currentCount, last_updated: new Date().toISOString() }).eq("id", progress.id);
      } else {
        await supabase.from("user_rewards_progress").insert({ customer_id: customerId, rule_id: rule.id, current_count: currentCount, total_required: totalRequired }).select().single();
      }

      // Si alcanzó el límite, crear recompensa
      if (currentCount >= totalRequired) {
        const rewardQty = Math.floor(currentCount / totalRequired);
        for (let i = 0; i < rewardQty; i++) {
          await supabase.from("reward_redemptions").insert({
            customer_id: customerId,
            rule_id: rule.id,
            order_id: orderId,
            reward_type: rule.reward_type || "free_product",
            reward_value: rule.reward_value || 0,
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }

        // Resetear progreso (solo el sobrante)
        const remaining = currentCount % totalRequired;
        await supabase.from("user_rewards_progress").update({ current_count: remaining, last_updated: new Date().toISOString() }).eq("customer_id", customerId).eq("rule_id", rule.id);

        await supabase.from("user_notifications").insert({
          customer_id: customerId,
          type: "reward_unlocked",
          title: `🎉 Recompensa desbloqueada!`,
          body: `Ganaste: ${rule.name}`,
          data: { rule_id: rule.id },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
