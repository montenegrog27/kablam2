import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@kablam/supabase/server";

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

export async function POST(request: Request) {
  const secret = process.env.REALTIME_JWT_SECRET;
  const realtimeHttpUrl = process.env.REALTIME_HTTP_URL;

  if (!secret || !realtimeHttpUrl) {
    return NextResponse.json({ error: "realtime_not_configured" }, { status: 503 });
  }

  const event = await request.json();
  if (!event?.tenantId || !event?.branchId || !event?.eventType) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const { data: userData } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();
  const authUser = userData.user;

  if (!authUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, tenant_id, branch_id, role")
    .eq("id", authUser.id)
    .single();

  if (!userRecord || userRecord.tenant_id !== event.tenantId) {
    return NextResponse.json({ error: "tenant_forbidden" }, { status: 403 });
  }

  const canUseBranch = ["owner", "admin"].includes(userRecord.role) || userRecord.branch_id === event.branchId;
  if (!canUseBranch) {
    return NextResponse.json({ error: "branch_forbidden" }, { status: 403 });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = signRealtimeToken(
    {
      sub: userRecord.id,
      tenantId: userRecord.tenant_id,
      branchIds: [event.branchId],
      role: userRecord.role,
      iat: now,
      exp: now + 8 * 60 * 60,
    },
    secret,
  );

  const response = await fetch(`${realtimeHttpUrl.replace(/\/$/, "")}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tenantId: event.tenantId,
      branchId: event.branchId,
      eventType: event.eventType,
      timestamp: event.timestamp ?? Date.now(),
      payload: event.payload ?? {},
    }),
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
