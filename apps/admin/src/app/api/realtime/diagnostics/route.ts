import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPERADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com";

type BranchSummary = {
  id: string;
  name: string | null;
  slug: string | null;
  tenant_id: string;
  tenants?: { name: string | null; slug: string | null }[] | null;
};

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signRealtimeToken(payload: Record<string, unknown>, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function createSupabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length);
}

async function fetchJson(url: string, init?: RequestInit) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - startedAt,
    data,
  };
}

export async function GET(request: NextRequest) {
  try {
    const realtimeHttpUrl = process.env.REALTIME_HTTP_URL;
    const realtimeWsUrl = process.env.NEXT_PUBLIC_REALTIME_WS_URL;
    const realtimeSecret = process.env.REALTIME_JWT_SECRET;

    if (!realtimeHttpUrl || !realtimeWsUrl || !realtimeSecret) {
      return NextResponse.json(
        {
          error: "realtime_env_missing",
          missing: {
            REALTIME_HTTP_URL: !realtimeHttpUrl,
            NEXT_PUBLIC_REALTIME_WS_URL: !realtimeWsUrl,
            REALTIME_JWT_SECRET: !realtimeSecret,
          },
        },
        { status: 500 },
      );
    }

    const supabase = createSupabaseService();
    const bearerToken = getBearerToken(request);
    if (!bearerToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(bearerToken);
    const authUser = authData.user;
    if (authError || !authUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("id, tenant_id, branch_id, role")
      .eq("id", authUser.id)
      .single();

    const isSuperAdmin = authUser.email === SUPERADMIN_EMAIL;
    if (!isSuperAdmin && !userRecord?.tenant_id) {
      return NextResponse.json({ error: "user_without_tenant" }, { status: 403 });
    }

    const scope = request.nextUrl.searchParams.get("scope") || "tenant";
    const now = Math.floor(Date.now() / 1000);
    const branchFilter = request.nextUrl.searchParams.get("branchId") || undefined;
    let branches: BranchSummary[] = [];

    if (isSuperAdmin && scope === "platform") {
      const { data } = await supabase
        .from("branches")
        .select("id, name, slug, tenant_id, tenants(name, slug)")
        .order("name", { ascending: true });
      branches = (data || []) as BranchSummary[];
    } else {
      const tenantId = userRecord!.tenant_id;
      const query = supabase
        .from("branches")
        .select("id, name, slug, tenant_id, tenants(name, slug)")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (userRecord!.role !== "owner" && userRecord!.role !== "admin" && userRecord!.branch_id) {
        query.eq("id", userRecord!.branch_id);
      }

      const { data } = await query;
      branches = (data || []) as BranchSummary[];
    }

    if (branchFilter) {
      branches = branches.filter((branch) => branch.id === branchFilter);
    }

    const branchIds = branches.map((branch) => branch.id);
    const token = signRealtimeToken(
      {
        sub: authUser.id,
        tenantId: isSuperAdmin && scope === "platform" ? "platform" : userRecord!.tenant_id,
        branchIds: isSuperAdmin && scope === "platform" ? ["*"] : branchIds,
        role: isSuperAdmin ? "superadmin" : userRecord!.role,
        iat: now,
        exp: now + 5 * 60,
      },
      realtimeSecret,
    );

    const health = await fetchJson(`${realtimeHttpUrl.replace(/\/$/, "")}/health`);
    let presence: Awaited<ReturnType<typeof fetchJson>> | null = null;

    if (!isSuperAdmin || scope !== "platform") {
      presence = await fetchJson(`${realtimeHttpUrl.replace(/\/$/, "")}/presence`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    return NextResponse.json({
      realtime: {
        httpUrl: realtimeHttpUrl,
        wsUrl: realtimeWsUrl,
        health,
        presence,
      },
      user: {
        email: authUser.email,
        role: isSuperAdmin ? "superadmin" : userRecord?.role,
        tenantId: userRecord?.tenant_id || null,
        branchId: userRecord?.branch_id || null,
      },
      branches,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "realtime_diagnostics_failed",
        details: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
