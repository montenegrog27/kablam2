import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCustomerSession } from "@/lib/customer-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function supabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getNextPlayableMatch(supabase: ReturnType<typeof supabaseService>, tenantId: string) {
  const { data } = await supabase
    .from("prode_matches")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("status", "pending")
    .gt("match_date", new Date().toISOString())
    .order("match_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data || null;
}

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = supabaseService();
  const match = await getNextPlayableMatch(supabase, session.tenantId);

  const [{ data: predictions }, { data: standings }] = await Promise.all([
    supabase
      .from("prode_predictions")
      .select("*, matches!match_id(*)")
      .eq("tenant_id", session.tenantId)
      .eq("customer_id", session.customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("prode_standings")
      .select("*, customers!customer_id(name)")
      .eq("tenant_id", session.tenantId)
      .order("total_points", { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({
    match,
    matches: match ? [match] : [],
    predictions: predictions || [],
    standings: standings || [],
    serverTime: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const matchId = String(body.matchId || "");
  const homeScore = Number(body.homeScore);
  const awayScore = Number(body.awayScore);
  const firstScorer = String(body.firstScorer || "").trim();

  if (!matchId || !Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
    return NextResponse.json({ error: "invalid_prediction" }, { status: 400 });
  }

  const supabase = supabaseService();
  const nextMatch = await getNextPlayableMatch(supabase, session.tenantId);
  if (!nextMatch || nextMatch.id !== matchId) {
    return NextResponse.json({ error: "only_next_match_allowed" }, { status: 403 });
  }

  if (new Date(nextMatch.match_date).getTime() <= Date.now()) {
    return NextResponse.json({ error: "match_locked" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("prode_predictions")
    .upsert(
      {
        tenant_id: session.tenantId,
        customer_id: session.customerId,
        match_id: matchId,
        home_score: homeScore,
        away_score: awayScore,
        first_scorer: firstScorer || null,
        total_goals: homeScore + awayScore,
        status: "pending",
      },
      { onConflict: "customer_id,match_id" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, prediction: data });
}
