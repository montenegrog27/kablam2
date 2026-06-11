import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type PopupRow = {
  id: string;
  name: string;
  description?: string | null;
  image_url: string;
  link_url?: string | null;
  schedule_type?: "all_days" | "specific_days" | null;
  days_of_week?: number[] | null;
  starts_at?: string | null;
  ends_at?: string | null;
  priority?: number | null;
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
    .select("id, name, description, image_url, link_url, schedule_type, days_of_week, starts_at, ends_at, priority")
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
  const activePopup = ((data || []) as PopupRow[]).find((popup) => {
    if (!popup.image_url) return false;
    if (popup.starts_at && new Date(popup.starts_at) > now) return false;
    if (popup.ends_at && new Date(popup.ends_at) < now) return false;
    if (popup.schedule_type === "specific_days") {
      return (popup.days_of_week || []).includes(argentinaDay);
    }
    return true;
  });

  return NextResponse.json({ popup: activePopup || null });
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
