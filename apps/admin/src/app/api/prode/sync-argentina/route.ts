import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { finalizeProdeMatch } from "@/lib/prode-rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ESPN_TEAM_ID = "202";
const ESPN_LEAGUES = [
  "fifa.friendly",
  "fifa.worldq.conmebol",
  "fifa.world",
  "conmebol.copa_america",
];

function createSupabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function formatEspnDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getScoreboardDates() {
  const dates = new Set<string>();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 3);

  for (let offset = 0; offset <= 75; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    dates.add(formatEspnDate(date));
  }

  return Array.from(dates);
}

async function getAuthorizedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "unauthorized" as const };

  const supabase = createSupabaseService();
  const token = authHeader.slice("Bearer ".length);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return { error: "unauthorized" as const };

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", authData.user.id)
    .single();

  if (!userRecord?.tenant_id) return { error: "user_without_tenant" as const };
  if (!["owner", "admin"].includes(userRecord.role)) return { error: "forbidden" as const };

  return { supabase, user: userRecord };
}

async function ensureProdeSchema(supabase: ReturnType<typeof createSupabaseService>) {
  const { error } = await supabase.from("prode_matches").select("id").limit(1);
  if (!error) return null;

  if (error.code === "PGRST205" || error.message?.includes("prode_matches")) {
    return {
      error: "prode_schema_missing",
      message: "Faltan crear las tablas del Prode. Ejecuta add_prode_mordisco.sql en Supabase y vuelve a sincronizar.",
      setupFile: "add_prode_mordisco.sql",
      details: error.message,
    };
  }

  return {
    error: "prode_schema_error",
    message: error.message,
    details: error.message,
  };
}

function statusFromEspn(event: any) {
  const state = event?.competitions?.[0]?.status?.type?.state;
  const completed = event?.competitions?.[0]?.status?.type?.completed;
  if (completed || state === "post") return "finished";
  if (state === "in") return "live";
  return "pending";
}

function scoreFor(competitor: any) {
  const value = competitor?.score?.value ?? competitor?.score?.displayValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEspnEvent(event: any) {
  const competitors = event?.competitions?.[0]?.competitors || [];
  const home = competitors.find((item: any) => item.homeAway === "home") || competitors[0];
  const away = competitors.find((item: any) => item.homeAway === "away") || competitors[1];
  if (!home?.team?.displayName || !away?.team?.displayName || !event?.date) return null;

  const status = statusFromEspn(event);
  return {
    externalId: String(event.id),
    home_team: home.team.displayName,
    away_team: away.team.displayName,
    match_date: new Date(event.date).toISOString(),
    home_score: status === "pending" ? null : scoreFor(home),
    away_score: status === "pending" ? null : scoreFor(away),
    status,
    round: event?.league?.slug === "fifa.world" ? "group" : "group",
  };
}

function eventHasArgentina(event: any) {
  const competitors = event?.competitions?.[0]?.competitors || [];
  return competitors.some((competitor: any) => {
    const team = competitor?.team || {};
    return (
      String(team.id || "") === ESPN_TEAM_ID ||
      String(team.abbreviation || "").toUpperCase() === "ARG" ||
      String(team.displayName || "").toLowerCase() === "argentina"
    );
  });
}

async function fetchArgentinaMatches() {
  const results: any[] = [];

  await Promise.all(
    ESPN_LEAGUES.map(async (league) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${ESPN_TEAM_ID}/schedule`;
      try {
        const response = await fetch(url, { next: { revalidate: 60 * 30 } });
        if (!response.ok) return;
        const payload = await response.json();
        for (const event of payload.events || []) {
          const normalized = normalizeEspnEvent(event);
          if (normalized) results.push(normalized);
        }
      } catch {
        // ESPN is an external optional source. Manual matches remain available.
      }
    }),
  );

  await Promise.all(
    getScoreboardDates().map(async (date) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`;
      try {
        const response = await fetch(url, { next: { revalidate: 60 * 30 } });
        if (!response.ok) return;
        const payload = await response.json();
        for (const event of payload.events || []) {
          if (!eventHasArgentina(event)) continue;
          const normalized = normalizeEspnEvent(event);
          if (normalized) results.push(normalized);
        }
      } catch {
        // Keep manual admin matches as fallback if ESPN scoreboard is unavailable.
      }
    }),
  );

  const unique = new Map<string, any>();
  for (const item of results) unique.set(item.externalId, item);
  return Array.from(unique.values()).sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
}

export async function POST(req: NextRequest) {
  const auth = await getAuthorizedUser(req);
  if ("error" in auth) {
    const status = auth.error === "forbidden" ? 403 : 401;
    return NextResponse.json({ error: auth.error }, { status });
  }

  const schemaError = await ensureProdeSchema(auth.supabase);
  if (schemaError) {
    return NextResponse.json(schemaError, { status: 500 });
  }

  const allMatches = await fetchArgentinaMatches();
  const now = Date.now();
  const relevantMatches = allMatches.filter((match) => {
    const matchTime = new Date(match.match_date).getTime();
    return match.status !== "finished" || matchTime >= now - 1000 * 60 * 60 * 24 * 3;
  });

  let inserted = 0;
  let updated = 0;
  let scoredPredictions = 0;
  let notifiedWinners = 0;
  let skippedNotifications = 0;
  let failedNotifications = 0;
  const failed: Array<{ match: string; error: string }> = [];

  for (const match of relevantMatches) {
    const from = new Date(new Date(match.match_date).getTime() - 1000 * 60 * 5).toISOString();
    const to = new Date(new Date(match.match_date).getTime() + 1000 * 60 * 5).toISOString();
    const { data: existing } = await auth.supabase
      .from("prode_matches")
      .select("id")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("home_team", match.home_team)
      .eq("away_team", match.away_team)
      .gte("match_date", from)
      .lte("match_date", to)
      .maybeSingle();

    const payload = {
      tenant_id: auth.user.tenant_id,
      home_team: match.home_team,
      away_team: match.away_team,
      match_date: match.match_date,
      home_score: match.home_score,
      away_score: match.away_score,
      status: match.status,
      round: match.round,
      is_active: true,
    };

    if (existing?.id) {
      const { error } = await auth.supabase.from("prode_matches").update(payload).eq("id", existing.id);
      if (!error) {
        updated += 1;
        if (match.status === "finished") {
          const result = await finalizeProdeMatch(auth.supabase, existing.id, { notifyWinners: true });
          scoredPredictions += result.scoredPredictions;
          notifiedWinners += result.notifiedWinners;
          skippedNotifications += result.skippedNotifications;
          failedNotifications += result.failedNotifications;
        }
      } else failed.push({ match: `${match.home_team} vs ${match.away_team}`, error: error.message });
    } else {
      const { data: insertedMatch, error } = await auth.supabase.from("prode_matches").insert(payload).select("id").single();
      if (!error) {
        inserted += 1;
        if (match.status === "finished" && insertedMatch?.id) {
          const result = await finalizeProdeMatch(auth.supabase, insertedMatch.id, { notifyWinners: true });
          scoredPredictions += result.scoredPredictions;
          notifiedWinners += result.notifiedWinners;
          skippedNotifications += result.skippedNotifications;
          failedNotifications += result.failedNotifications;
        }
      } else failed.push({ match: `${match.home_team} vs ${match.away_team}`, error: error.message });
    }
  }

  const nextMatch = relevantMatches.find((match) => new Date(match.match_date).getTime() > now && match.status === "pending");

  return NextResponse.json({
    ok: true,
    source: "espn",
    fetched: allMatches.length,
    relevant: relevantMatches.length,
    imported: inserted + updated,
    inserted,
    updated,
    scoredPredictions,
    notifiedWinners,
    skippedNotifications,
    failedNotifications,
    failed,
    nextMatch: nextMatch || null,
  });
}
