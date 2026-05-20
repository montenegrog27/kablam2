import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCustomerSession } from "@/lib/customer-session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type OrderItemRow = {
  quantity?: number;
  products?: { name?: string } | null;
};

type OrderRow = {
  id: string;
  status?: string;
  type?: string;
  total?: number;
  address?: string | null;
  created_at?: string;
  order_items?: OrderItemRow[];
};

type RewardProgressRow = {
  id: string;
  rule_id?: string;
  current_count?: number;
  total_required?: number;
  loyalty_rules?: { name?: string } | null;
};

type RedemptionRow = {
  id: string;
  reward_type?: string;
  reward_value?: number;
  expires_at?: string | null;
};

type FavoriteRow = {
  id: string;
  product_id?: string;
  products?: { name?: string } | null;
  product_variants?: Array<{ price?: number }> | null;
};

type NotificationRow = {
  id: string;
  type?: string;
  title?: string;
  body?: string;
  created_at?: string;
};

export async function GET() {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", session.customerId)
    .single();

  if (!customer) {
    return NextResponse.json(
      { error: "Cliente no encontrado" },
      { status: 404 },
    );
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("*, order_items(*, products(name))")
    .eq("customer_id", session.customerId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: rewardsProgress } = await supabase
    .from("user_rewards_progress")
    .select("*, loyalty_rules(*)")
    .eq("customer_id", session.customerId);

  const { data: redemptions } = await supabase
    .from("reward_redemptions")
    .select("*")
    .eq("customer_id", session.customerId)
    .eq("used", false)
    .order("redeemed_at", { ascending: false });

  const { data: favorites } = await supabase
    .from("user_favorites")
    .select("*, products(*), product_variants(*)")
    .eq("customer_id", session.customerId);

  const { data: notifications } = await supabase
    .from("user_notifications")
    .select("*")
    .eq("customer_id", session.customerId)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(5);

  let level = "Novato";
  let nextLevel = "Aprendiz";
  let progress = 0;
  const points = customer.loyalty_points || 0;

  if (points >= 1000) {
    level = "Leyenda";
    nextLevel = "Maximo";
    progress = 100;
  } else if (points >= 500) {
    level = "Experto";
    nextLevel = "Leyenda";
    progress = Math.min(100, (points - 500) / 5);
  } else if (points >= 200) {
    level = "Aprendiz";
    nextLevel = "Experto";
    progress = Math.min(100, (points - 200) / 3);
  } else {
    progress = (points / 200) * 100;
  }

  const stats = { burgers: 0, pizzas: 0, drinks: 0, other: 0 };
  const categoryKeywords: Record<keyof typeof stats, string[]> = {
    burgers: ["hamburguesa", "burger", "carne", "doble"],
    pizzas: ["pizza", "muzza", "napolitana"],
    drinks: ["bebida", "gaseosa", "agua", "cerveza", "coca"],
    other: [],
  };

  ((orders || []) as OrderRow[]).forEach((order) => {
    (order.order_items || []).forEach((item) => {
      const name = (item.products?.name || "").toLowerCase();
      const category = (Object.entries(categoryKeywords) as Array<
        [keyof typeof stats, string[]]
      >).find(
        ([key, keywords]) =>
          key !== "other" && keywords.some((keyword) => name.includes(keyword)),
      )?.[0];

      stats[category || "other"] += item.quantity || 1;
    });
  });

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      birthDate: customer.birth_date,
      avatar: customer.name?.[0] || "?",
      created_at: customer.created_at,
    },
    stats: {
      totalOrders: customer.lifetime_orders || orders?.length || 0,
      totalSpent: customer.lifetime_spent || 0,
      points,
      totalPointsEarned: customer.total_points_earned || 0,
      level,
      nextLevel,
      progress: Math.round(progress),
      products: stats,
    },
    orders: ((orders || []) as OrderRow[]).map((order) => ({
      id: order.id,
      status: order.status,
      type: order.type,
      total: order.total,
      address: order.address,
      created_at: order.created_at,
      items: (order.order_items || []).map((item) => ({
        name: item.products?.name || "Producto",
        quantity: item.quantity,
      })),
    })),
    rewards: ((rewardsProgress || []) as RewardProgressRow[]).map((reward) => ({
      id: reward.id,
      ruleId: reward.rule_id,
      name: reward.loyalty_rules?.name || "Recompensa",
      currentCount: reward.current_count || 0,
      totalRequired: reward.total_required || 1,
      progress: Math.min(
        100,
        ((reward.current_count || 0) / (reward.total_required || 1)) * 100,
      ),
      unlocked: (reward.current_count || 0) >= (reward.total_required || 1),
    })),
    availableRedemptions: ((redemptions || []) as RedemptionRow[]).map(
      (redemption) => ({
        id: redemption.id,
        type: redemption.reward_type,
        value: redemption.reward_value,
        expires_at: redemption.expires_at,
      }),
    ),
    favorites: ((favorites || []) as FavoriteRow[]).map((favorite) => ({
      id: favorite.id,
      productId: favorite.product_id,
      name: favorite.products?.name || "Producto",
      price: favorite.product_variants?.[0]?.price || 0,
    })),
    notifications: ((notifications || []) as NotificationRow[]).map(
      (notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        created_at: notification.created_at,
      }),
    ),
  });
}

export async function PUT(req: Request) {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { name, email, birthDate } = await req.json();
  const updates: Record<string, string | boolean | null> = {};

  if (name !== undefined) updates.name = String(name).trim() || null;
  if (email !== undefined) updates.email = String(email).trim() || null;
  if (birthDate !== undefined) updates.birth_date = birthDate || null;

  if (name !== undefined || email !== undefined || birthDate !== undefined) {
    updates.profile_completed = Boolean(updates.name);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Sin datos para actualizar" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", session.customerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
