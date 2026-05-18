import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "kablam-secret-change-in-production";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSession(req: NextRequest) {
  const token = req.cookies.get("kablam_session")?.value;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET) as any; } catch { return null; }
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", session.customerId)
    .single();

  if (!customer) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  // Pedidos recientes
  const { data: orders } = await supabase
    .from("orders")
    .select("*, order_items(*, products(name))")
    .eq("customer_id", session.customerId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Progreso de recompensas
  const { data: rewardsProgress } = await supabase
    .from("user_rewards_progress")
    .select("*, loyalty_rules(*)")
    .eq("customer_id", session.customerId);

  // Canjes disponibles
  const { data: redemptions } = await supabase
    .from("reward_redemptions")
    .select("*")
    .eq("customer_id", session.customerId)
    .eq("used", false)
    .order("redeemed_at", { ascending: false });

  // Favoritos
  const { data: favorites } = await supabase
    .from("user_favorites")
    .select("*, products(*), product_variants(*)")
    .eq("customer_id", session.customerId);

  // Notificaciones no leídas
  const { data: notifications } = await supabase
    .from("user_notifications")
    .select("*")
    .eq("customer_id", session.customerId)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(5);

  // Calcular nivel según puntos
  let level = "🍟 Novato";
  let nextLevel = "🍔 Aprendiz";
  let progress = 0;
  const points = customer.loyalty_points || 0;
  if (points >= 1000) { level = "🔥 Leyenda"; nextLevel = "⭐ Máximo"; progress = 100; }
  else if (points >= 500) { level = "🥩 Experto"; nextLevel = "🔥 Leyenda"; progress = Math.min(100, (points - 500) / 5); }
  else if (points >= 200) { level = "🍔 Aprendiz"; nextLevel = "🥩 Experto"; progress = Math.min(100, (points - 200) / 3); }
  else { level = "🍟 Novato"; nextLevel = "🍔 Aprendiz"; progress = (points / 200) * 100; }

  // Stats por tipo de producto
  const stats = { burgers: 0, pizzas: 0, drinks: 0, other: 0 };
  const categoryKeywords: Record<string, string[]> = {
    burgers: ["hamburguesa", "burger", "carne", "doble"],
    pizzas: ["pizza", "muzza", "napolitana"],
    drinks: ["bebida", "gaseosa", "agua", "cerveza", "coca"],
  };
  (orders || []).forEach((order: any) => {
    (order.order_items || []).forEach((item: any) => {
      const name = (item.products?.name || "").toLowerCase();
      let categorized = false;
      for (const [cat, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some((k) => name.includes(k))) {
          stats[cat as keyof typeof stats] += item.quantity || 1;
          categorized = true; break;
        }
      }
      if (!categorized) stats.other += item.quantity || 1;
    });
  });

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      avatar: customer.name?.[0] || "?",
      created_at: customer.created_at,
    },
    stats: {
      totalOrders: customer.lifetime_orders || orders?.length || 0,
      totalSpent: customer.lifetime_spent || 0,
      points: customer.loyalty_points || 0,
      totalPointsEarned: customer.total_points_earned || 0,
      level,
      nextLevel,
      progress: Math.round(progress),
      products: stats,
    },
    orders: (orders || []).map((o: any) => ({
      id: o.id,
      status: o.status,
      type: o.type,
      total: o.total,
      address: o.address,
      created_at: o.created_at,
      items: (o.order_items || []).map((i: any) => ({
        name: i.products?.name || "Producto",
        quantity: i.quantity,
        price: i.unit_price,
        note: i.note,
      })),
    })),
    rewards: (rewardsProgress || []).map((rp: any) => ({
      id: rp.id,
      ruleId: rp.rule_id,
      name: rp.loyalty_rules?.name || "Recompensa",
      currentCount: rp.current_count,
      totalRequired: rp.total_required,
      progress: Math.min(100, (rp.current_count / rp.total_required) * 100),
      unlocked: rp.current_count >= rp.total_required,
    })),
    availableRedemptions: (redemptions || []).map((r: any) => ({
      id: r.id,
      type: r.reward_type,
      value: r.reward_value,
      expires_at: r.expires_at,
    })),
    favorites: (favorites || []).map((f: any) => ({
      id: f.id,
      productId: f.product_id,
      name: f.products?.name || "Producto",
      price: f.product_variants?.[0]?.price || 0,
    })),
    notifications: (notifications || []).map((n: any) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      created_at: n.created_at,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { name, email, birthDate } = await req.json();

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (birthDate !== undefined) updates.birth_date = birthDate;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Sin datos para actualizar" }, { status: 400 });
  }

  const { error } = await supabase.from("customers").update(updates).eq("id", session.customerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
