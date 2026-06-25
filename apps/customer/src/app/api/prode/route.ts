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

function normalizeArgWhatsapp(input?: string | null) {
  let digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("549") && digits.length >= 12) return digits;
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9") && digits.length === 11) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  return digits.length === 10 ? `549${digits}` : null;
}

function formatMatchDate(date: string) {
  return new Date(date).toLocaleString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

async function sendProdeParticipationWhatsapp({
  phone,
  name,
  tenantSlug,
  branchSlug,
  match,
  homeScore,
  awayScore,
  firstScorer,
}: {
  phone?: string | null;
  name?: string | null;
  tenantSlug?: string | null;
  branchSlug?: string | null;
  match: any;
  homeScore: number;
  awayScore: number;
  firstScorer?: string | null;
}) {
  const whatsappToken = String(process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!whatsappToken) return { skipped: true, reason: "WHATSAPP_TOKEN missing" };

  const whatsappPhone = normalizeArgWhatsapp(phone);
  if (!whatsappPhone) return { ok: false, reason: "invalid_whatsapp_phone" };

  const customerName = String(name || "crack").trim();
  const scorerText = firstScorer ? firstScorer : "Sin goleador elegido";
  const message =
    `Hola ${customerName}!\n\n` +
    `Gracias por participar en el *Prode Mordisco*.\n\n` +
    `Tu jugada quedo registrada:\n\n` +
    `*${match.home_team} ${homeScore} - ${awayScore} ${match.away_team}*\n` +
    `Goleador: *${scorerText}*\n` +
    `Partido: ${formatMatchDate(match.match_date)}\n\n` +
    `Cuando termine el partido cargamos el resultado y actualizamos el ranking.\n\n` +
    `Premios:\n` +
    `- Resultado acertado: 1 Cheese Bacon Simple gratis.\n` +
    `- Goleador acertado: 1 porcion de papas.\n` +
    `- Doble acierto: 1 Cheese Bacon Doble con Papas.\n\n` +
    `Gracias por jugar. Mordisco te espera.`;

  try {
    const response = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${whatsappToken}`,
      },
      body: JSON.stringify({
        slug: tenantSlug || branchSlug || "mordiscoburgers",
        branchId: branchSlug || tenantSlug || "mordiscoburgers",
        phone: whatsappPhone,
        message,
      }),
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      response: text,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "whatsapp_send_failed",
      error: error instanceof Error ? error.message : "No se pudo enviar WhatsApp",
    };
  }
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
          .select("id, name, avatar_url")
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

  const [{ data: customer }, { data: branch }] = await Promise.all([
    supabase
      .from("customers")
      .select("name, phone")
      .eq("id", session.customerId)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("slug, tenants(slug)")
      .eq("id", session.branchId)
      .maybeSingle(),
  ]);

  const whatsapp = await sendProdeParticipationWhatsapp({
    phone: customer?.phone || session.phone,
    name: customer?.name || session.name,
    tenantSlug: (branch?.tenants as any)?.slug || null,
    branchSlug: branch?.slug || session.branchId,
    match: nextMatch,
    homeScore,
    awayScore,
    firstScorer,
  });

  return NextResponse.json({ ok: true, prediction: data, whatsapp });
}
