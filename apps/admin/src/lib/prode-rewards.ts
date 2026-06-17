import type { SupabaseClient } from "@supabase/supabase-js";

type RewardType = "exact" | "scorer" | "double";

type FinalizeResult = {
  scoredPredictions: number;
  notifiedWinners: number;
  skippedNotifications: number;
  failedNotifications: number;
  notificationsUnavailable?: boolean;
};

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

export function scorePrediction(prediction: any, match: any) {
  let points = 0;
  let bonus = 0;
  const isExact = prediction.home_score === match.home_score && prediction.away_score === match.away_score;
  const isScorer =
    prediction.first_scorer &&
    match.first_scorer &&
    prediction.first_scorer.toLowerCase() === match.first_scorer.toLowerCase();
  const isGoals =
    (prediction.home_score || 0) + (prediction.away_score || 0) ===
    (match.home_score || 0) + (match.away_score || 0);

  if (isExact) points += 5;
  if (isScorer) points += 3;
  if (isGoals) points += 2;
  if (points >= 10) bonus = 3;

  return { points, bonus, isExact, isScorer, isGoals };
}

function rewardTypeFor(prediction: any, match: any): RewardType | null {
  const { isExact, isScorer } = scorePrediction(prediction, match);
  if (isExact && isScorer) return "double";
  if (isExact) return "exact";
  if (isScorer) return "scorer";
  return null;
}

function rewardText(type: RewardType) {
  if (type === "double") return "1 Cheese Bacon Doble con Papas";
  if (type === "exact") return "1 Cheese Bacon Simple gratis";
  return "1 porcion de papas";
}

function buildWinnerMessage({ customer, match, prediction, rewardType }: { customer: any; match: any; prediction: any; rewardType: RewardType }) {
  const name = String(customer?.name || "crack").trim();
  const scorerText = prediction.first_scorer ? ` y goleador ${prediction.first_scorer}` : "";
  return (
    `Hola ${name}!\n\n` +
    `Termino *${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team}*.\n\n` +
    `Tu jugada fue *${prediction.home_score} - ${prediction.away_score}*${scorerText}.\n\n` +
    `Ganaste: *${rewardText(rewardType)}*.\n\n` +
    `Mostra este mensaje en Mordisco para canjear tu premio. Partido: ${formatMatchDate(match.match_date)}.`
  );
}

async function sendWhatsapp(phone: string | null | undefined, message: string, branchSlug?: string | null) {
  const whatsappToken = String(process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!whatsappToken) return { ok: false, skipped: true, response: "WHATSAPP_TOKEN missing" };

  const whatsappPhone = normalizeArgWhatsapp(phone);
  if (!whatsappPhone) return { ok: false, skipped: true, response: "invalid_whatsapp_phone" };

  const response = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${whatsappToken}`,
    },
    body: JSON.stringify({
      slug: "mordiscoburgers",
      branchId: branchSlug || "mordiscoburgers",
      phone: whatsappPhone,
      message,
    }),
  });

  const text = await response.text();
  return { ok: response.ok, skipped: false, status: response.status, response: text };
}

export async function rebuildProdeStandings(supabase: SupabaseClient, tenantId: string) {
  const { data: predictions } = await supabase
    .from("prode_predictions")
    .select("*, prode_matches(home_score, away_score, first_scorer, status)")
    .eq("tenant_id", tenantId)
    .eq("status", "finished");

  const totals = new Map<string, any>();

  for (const prediction of predictions || []) {
    const match = Array.isArray(prediction.prode_matches) ? prediction.prode_matches[0] : prediction.prode_matches;
    if (!match || match.status !== "finished") continue;

    const current = totals.get(prediction.customer_id) || {
      tenant_id: tenantId,
      customer_id: prediction.customer_id,
      total_points: 0,
      correct_results: 0,
      correct_scorers: 0,
      correct_goals: 0,
      perfect_predictions: 0,
      updated_at: new Date().toISOString(),
    };

    const score = scorePrediction(prediction, match);

    current.total_points += Number(prediction.points_earned || 0) + Number(prediction.bonus_points || 0);
    current.correct_results += score.isExact ? 1 : 0;
    current.correct_scorers += score.isScorer ? 1 : 0;
    current.correct_goals += score.isGoals ? 1 : 0;
    current.perfect_predictions += score.isExact && score.isScorer && score.isGoals ? 1 : 0;
    totals.set(prediction.customer_id, current);
  }

  await supabase.from("prode_standings").delete().eq("tenant_id", tenantId);

  const rows = Array.from(totals.values());
  if (rows.length) await supabase.from("prode_standings").insert(rows);
}

async function notifyWinners(supabase: SupabaseClient, match: any, predictions: any[]): Promise<Omit<FinalizeResult, "scoredPredictions">> {
  const winners = predictions
    .map((prediction) => ({ prediction, rewardType: rewardTypeFor(prediction, match) }))
    .filter((item): item is { prediction: any; rewardType: RewardType } => Boolean(item.rewardType));

  if (!winners.length) {
    return { notifiedWinners: 0, skippedNotifications: 0, failedNotifications: 0 };
  }

  const customerIds = Array.from(new Set(winners.map((item) => item.prediction.customer_id).filter(Boolean)));
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, name, phone").in("id", customerIds)
    : { data: [] };
  const { data: branch } = await supabase.from("branches").select("slug").eq("tenant_id", match.tenant_id).limit(1).maybeSingle();
  const customerById = new Map((customers || []).map((customer: any) => [customer.id, customer]));

  let notifiedWinners = 0;
  let skippedNotifications = 0;
  let failedNotifications = 0;
  let notificationsUnavailable = false;

  for (const winner of winners) {
    const customer = customerById.get(winner.prediction.customer_id);
    const message = buildWinnerMessage({ customer, match, prediction: winner.prediction, rewardType: winner.rewardType });
    const { data: notification, error: insertError } = await supabase
      .from("prode_reward_notifications")
      .insert({
        tenant_id: match.tenant_id,
        match_id: match.id,
        prediction_id: winner.prediction.id,
        customer_id: winner.prediction.customer_id,
        reward_type: winner.rewardType,
        message,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        skippedNotifications += 1;
        continue;
      }
      if (insertError.code === "PGRST205" || insertError.message?.includes("prode_reward_notifications")) {
        notificationsUnavailable = true;
        skippedNotifications += 1;
        continue;
      }
      failedNotifications += 1;
      continue;
    }

    const result = await sendWhatsapp(customer?.phone, message, branch?.slug);
    if (result.ok) notifiedWinners += 1;
    else if (result.skipped) skippedNotifications += 1;
    else failedNotifications += 1;

    await supabase
      .from("prode_reward_notifications")
      .update({
        status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
        response: result.response,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("id", notification.id);
  }

  return { notifiedWinners, skippedNotifications, failedNotifications, notificationsUnavailable };
}

export async function finalizeProdeMatch(
  supabase: SupabaseClient,
  matchId: string,
  options: { notifyWinners?: boolean } = {},
): Promise<FinalizeResult> {
  const { data: match } = await supabase.from("prode_matches").select("*").eq("id", matchId).maybeSingle();
  if (!match || match.status !== "finished") {
    return { scoredPredictions: 0, notifiedWinners: 0, skippedNotifications: 0, failedNotifications: 0 };
  }

  const { data: predictions } = await supabase.from("prode_predictions").select("*").eq("match_id", matchId);
  const rows = predictions || [];

  for (const prediction of rows) {
    const score = scorePrediction(prediction, match);
    await supabase
      .from("prode_predictions")
      .update({
        points_earned: score.points,
        bonus_points: score.bonus,
        status: "finished",
        updated_at: new Date().toISOString(),
      })
      .eq("id", prediction.id);
  }

  await rebuildProdeStandings(supabase, match.tenant_id);

  const notifications = options.notifyWinners
    ? await notifyWinners(supabase, match, rows)
    : { notifiedWinners: 0, skippedNotifications: 0, failedNotifications: 0 };

  return {
    scoredPredictions: rows.length,
    ...notifications,
  };
}
