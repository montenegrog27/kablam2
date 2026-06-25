import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type PopupRow = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  show_promotions?: boolean | null;
  promotion_ids?: string[] | null;
  schedule_type?: "all_days" | "specific_days" | null;
  days_of_week?: number[] | null;
  starts_at?: string | null;
  ends_at?: string | null;
  priority?: number | null;
};

type PromotionRow = {
  id: string;
  name: string;
  description?: string | null;
  badge?: string | null;
  image_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const branchSlug = url.searchParams.get("branchSlug");

  if (!branchSlug) {
    return NextResponse.json({ popup: null }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: branch } = await supabase
    .from("branches")
    .select("id, tenant_id")
    .eq("slug", branchSlug)
    .maybeSingle();

  if (!branch) {
    return NextResponse.json({ popup: null }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("customer_popups")
    .select("*")
    .eq("tenant_id", branch.tenant_id)
    .eq("active", true)
    .or(`branch_id.is.null,branch_id.eq.${branch.id}`)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error?.code === "42P01") {
    return NextResponse.json({ popup: null, warning: "customer_popups_schema_missing" });
  }

  if (error) {
    return NextResponse.json({ popup: null, error: error.message }, { status: 500 });
  }

  const now = new Date();
  const argentinaDay = getArgentinaDay(now);
  const scheduledPopups = ((data || []) as PopupRow[]).filter((popup) => {
    if (!popup.show_promotions && !popup.image_url) return false;
    if (popup.starts_at && new Date(popup.starts_at) > now) return false;
    if (popup.ends_at && new Date(popup.ends_at) < now) return false;
    if (popup.schedule_type === "specific_days") {
      return (popup.days_of_week || []).includes(argentinaDay);
    }
    return true;
  });

  for (const popup of scheduledPopups) {
    if (!popup.show_promotions) {
      return NextResponse.json({ popup });
    }

    const promotionIds = (popup.promotion_ids || []).slice(0, 2);
    if (promotionIds.length === 0) continue;

    const { data: promotionRows, error: promotionsError } = await supabase
      .from("promotions")
      .select("id, name, description, badge, image_url, start_date, end_date")
      .eq("tenant_id", branch.tenant_id)
      .eq("active", true)
      .in("id", promotionIds);

    if (promotionsError) continue;

    const activePromotions = ((promotionRows || []) as PromotionRow[])
      .filter((promotion) => {
        if (promotion.start_date && new Date(promotion.start_date) > now) return false;
        if (promotion.end_date && new Date(promotion.end_date) < now) return false;
        return true;
      })
      .sort((a, b) => promotionIds.indexOf(a.id) - promotionIds.indexOf(b.id));

    if (activePromotions.length > 0) {
      return NextResponse.json({
        popup: {
          ...popup,
          promotions: activePromotions,
        },
      });
    }

    await supabase
      .from("customer_popups")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", popup.id);
  }

  return NextResponse.json({ popup: null });
}

function getArgentinaDay(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
  });
  const value = formatter.format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[value] ?? date.getDay();
}
