import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCustomerSession } from "@/lib/customer-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PREDICTION_LOCK_MINUTES = 5;

function supabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function predictionLockDate() {
  return new Date(Date.now() + PREDICTION_LOCK_MINUTES * 60 * 1000);
}

async function getNextPlayableMatch(supabase: ReturnType<typeof supabaseService>, tenantId: string) {
  const { data } = await supabase
    .from("prode_matches")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("status", "pending")
    .gt("match_date", predictionLockDate().toISOString())
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

  const [{ data: predictionsRaw }, { data: standingsRaw }, { data: allPredictionsRaw }] = await Promise.all([
    supabase
      .from("prode_predictions")
      .select("*")
      .eq("tenant_id", session.tenantId)
      .eq("customer_id", session.customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("prode_standings")
      .select("*")
      .eq("tenant_id", session.tenantId)
      .order("total_points", { ascending: false })
      .limit(100),
    supabase
      .from("prode_predictions")
      .select("*")
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const predictions = predictionsRaw || [];
  const standings = standingsRaw || [];
  const allPredictions = allPredictionsRaw || [];
  const matchIds = Array.from(new Set([...predictions, ...allPredictions].map((prediction) => prediction.match_id).filter(Boolean)));
  const customerIds = Array.from(new Set([
    ...standings.map((standing) => standing.customer_id),
    ...allPredictions.map((prediction) => prediction.customer_id),
  ].filter(Boolean)));

  const [{ data: relatedMatches }, { data: relatedCustomers }] = await Promise.all([
    matchIds.length
      ? supabase
          .from("prode_matches")
          .select("id, home_team, away_team, match_date, home_score, away_score, status, round")
          .in("id", matchIds)
      : Promise.resolve({ data: [] }),
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, name")
          .in("id", customerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const matchById = new Map((relatedMatches || []).map((item) => [item.id, item]));
  const customerById = new Map((relatedCustomers || []).map((item) => [item.id, item]));
  const withRelations = (prediction: any) => ({
    ...prediction,
    matches: matchById.get(prediction.match_id) || null,
    customers: customerById.get(prediction.customer_id) || null,
  });
  const standingsWithCustomers = standings.map((standing: any) => ({
    ...standing,
    customers: customerById.get(standing.customer_id) || null,
  }));

  return NextResponse.json({
    match,
    matches: match ? [match] : [],
    predictions: predictions.map(withRelations),
    allPredictions: allPredictions.map(withRelations),
    standings: standingsWithCustomers,
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

  if (new Date(nextMatch.match_date).getTime() - PREDICTION_LOCK_MINUTES * 60 * 1000 <= Date.now()) {
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

  const { data: standing } = await supabase
    .from("prode_standings")
    .select("id")
    .eq("tenant_id", session.tenantId)
    .eq("customer_id", session.customerId)
    .maybeSingle();

  if (!standing) {
    await supabase.from("prode_standings").insert({
      tenant_id: session.tenantId,
      customer_id: session.customerId,
      total_points: 0,
      correct_results: 0,
      correct_scorers: 0,
      correct_goals: 0,
      perfect_predictions: 0,
    });
  }

  return NextResponse.json({ ok: true, prediction: data });
}
