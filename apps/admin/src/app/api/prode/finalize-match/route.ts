import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { finalizeProdeMatch } from "@/lib/prode-rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createSupabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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
  if (!["owner", "manager", "admin"].includes(userRecord.role)) return { error: "forbidden" as const };

  return { supabase, user: userRecord };
}

export async function POST(req: NextRequest) {
  const auth = await getAuthorizedUser(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "forbidden" ? 403 : 401 });
  }

  const body = await req.json();
  const matchId = String(body.matchId || "");
  if (!matchId) return NextResponse.json({ error: "match_required" }, { status: 400 });

  const { data: match } = await auth.supabase
    .from("prode_matches")
    .select("id, tenant_id, status")
    .eq("id", matchId)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();

  if (!match) return NextResponse.json({ error: "match_not_found" }, { status: 404 });
  if (match.status !== "finished") return NextResponse.json({ error: "match_not_finished" }, { status: 400 });

  const result = await finalizeProdeMatch(auth.supabase, matchId, { notifyWinners: true });
  return NextResponse.json({ ok: true, ...result });
}
