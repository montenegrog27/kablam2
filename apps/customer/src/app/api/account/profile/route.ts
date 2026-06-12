import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCustomerSession, getCustomerSession } from "@/lib/customer-session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type OrderItemRow = {
  quantity?: number;
  products?: { name?: string } | null;
  combos?: { name?: string } | null;
  extras?: Array<{ type?: string; name?: string }> | null;
};

type OrderRow = {
  id: string;
  order_number?: string | null;
  status?: string;
  type?: string;
  total?: number;
  subtotal?: number;
  shipping_cost?: number;
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
  loyalty_rewards?: { name?: string; description?: string | null; points_cost?: number | null } | null;
  reward_id?: string | null;
  reward_type?: string;
  reward_value?: number;
  points_cost?: number;
  code?: string | null;
  status?: string | null;
  expires_at?: string | null;
};

type LoyaltyRewardRow = {
  id: string;
  name?: string;
  description?: string | null;
  points_cost?: number;
  reward_type?: string;
  reward_value?: number | null;
  image_url?: string | null;
  sort_order?: number | null;
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

type LoyaltyLevelRow = {
  name?: string;
  min_points?: number;
  max_points?: number | null;
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
    .select("*, order_items(*, products(name), combos(name))")
    .eq("customer_id", session.customerId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: allOrders } = await supabase
    .from("orders")
    .select("id, total, status, created_at")
    .eq("customer_id", session.customerId)
    .neq("status", "cancelled");

  const { data: rewardsProgress } = await supabase
    .from("user_rewards_progress")
    .select("*, loyalty_rules(*)")
    .eq("customer_id", session.customerId);

  const { data: redemptions } = await supabase
    .from("reward_redemptions")
    .select("*, loyalty_rewards(name, description, points_cost)")
    .eq("customer_id", session.customerId)
    .eq("used", false)
    .order("redeemed_at", { ascending: false });

  const { count: rewardsRedeemedCount } = await supabase
    .from("reward_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", session.customerId)
    .eq("used", true);

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

  const { data: loyaltyLevels } = await supabase
    .from("loyalty_levels")
    .select("name, min_points, max_points")
    .eq("tenant_id", session.tenantId)
    .eq("is_active", true)
    .order("min_points", { ascending: true });

  const { data: loyaltyRewards } = await supabase
    .from("loyalty_rewards")
    .select("id, name, description, points_cost, reward_type, reward_value, image_url, sort_order")
    .eq("tenant_id", session.tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("points_cost", { ascending: true });

  let level = "Mordisco";
  let nextLevel = "Doble Mordisco";
  let progress = 0;
  const points = customer.loyalty_points || 0;

  const levels = ((loyaltyLevels || []) as LoyaltyLevelRow[]);
  if (levels.length > 0) {
    const currentIndex = Math.max(
      0,
      levels.findIndex(
        (candidate) =>
          points >= Number(candidate.min_points || 0) &&
          (candidate.max_points == null || points <= Number(candidate.max_points)),
      ),
    );
    const current = levels[currentIndex] || levels[0];
    const next = levels[currentIndex + 1];
    level = current.name || level;
    nextLevel = next?.name || "Maximo";

    if (!next) {
      progress = 100;
    } else {
      const min = Number(current.min_points || 0);
      const nextMin = Number(next.min_points || min + 1);
      progress = ((points - min) / Math.max(1, nextMin - min)) * 100;
    }
  } else {
    if (points >= 7000) {
      level = "Leyenda Mordisco";
      nextLevel = "Maximo";
      progress = 100;
    } else if (points >= 3000) {
      level = "Mordisco XL";
      nextLevel = "Leyenda Mordisco";
      progress = ((points - 3000) / 4000) * 100;
    } else if (points >= 1000) {
      level = "Doble Mordisco";
      nextLevel = "Mordisco XL";
      progress = ((points - 1000) / 2000) * 100;
    } else {
      progress = (points / 1000) * 100;
    }
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

  const spendOrders = (allOrders || []) as Array<{ total?: number }>;
  const calculatedTotalSpent = spendOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const calculatedTotalOrders = spendOrders.length;

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      birthDate: customer.birth_date,
      avatar: customer.name?.[0] || "?",
      avatarUrl: customer.avatar_url,
      created_at: customer.created_at,
    },
    stats: {
      totalOrders: customer.lifetime_orders || calculatedTotalOrders || orders?.length || 0,
      totalSpent: Number(customer.lifetime_spent || 0) || calculatedTotalSpent,
      points,
      rewardsRedeemed: rewardsRedeemedCount || 0,
      totalPointsEarned: customer.total_points_earned || 0,
      level,
      nextLevel,
      levels: levels.map((item) => ({
        name: item.name,
        minPoints: item.min_points || 0,
        maxPoints: item.max_points ?? null,
      })),
      progress: Math.round(Math.max(0, Math.min(100, progress))),
      products: stats,
    },
    orders: ((orders || []) as OrderRow[]).map((order) => ({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      type: order.type,
      total: order.total,
      subtotal: order.subtotal,
      shipping_cost: order.shipping_cost || 0,
      address: order.address,
      created_at: order.created_at,
      items: (order.order_items || []).map((item) => ({
        name: item.products?.name || item.combos?.name || item.extras?.find((extra) => extra.type === "promotion")?.name || "Producto",
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
        rewardId: redemption.reward_id,
        name: redemption.loyalty_rewards?.name || "Recompensa",
        description: redemption.loyalty_rewards?.description || null,
        type: redemption.reward_type,
        value: redemption.reward_value,
        pointsCost: redemption.points_cost || redemption.loyalty_rewards?.points_cost || 0,
        code: redemption.code,
        status: redemption.status || "available",
        expires_at: redemption.expires_at,
      }),
    ),
    rewardCatalog: ((loyaltyRewards || []) as LoyaltyRewardRow[]).map((reward) => ({
      id: reward.id,
      name: reward.name || "Recompensa",
      description: reward.description || null,
      pointsCost: reward.points_cost || 0,
      type: reward.reward_type || "manual",
      value: reward.reward_value ?? null,
      imageUrl: reward.image_url || null,
      sortOrder: reward.sort_order || 100,
      canRedeem: points >= Number(reward.points_cost || 0),
    })),
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
  const { name, email, birthDate, avatarUrl } = await req.json();
  const updates: Record<string, string | boolean | null> = {};
  const nextName = name !== undefined ? String(name).trim() : undefined;

  if (name !== undefined) updates.name = nextName || null;
  if (email !== undefined) updates.email = String(email).trim() || null;
  if (birthDate !== undefined) updates.birth_date = birthDate || null;
  if (avatarUrl !== undefined) updates.avatar_url = String(avatarUrl).trim() || null;

  if (name !== undefined) {
    updates.profile_completed = Boolean(nextName);
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

  if (name !== undefined) {
    await createCustomerSession({
      customerId: session.customerId,
      branchId: session.branchId,
      tenantId: session.tenantId,
      phone: session.phone,
      name: nextName || undefined,
    });
  }

  return NextResponse.json({ success: true });
}
