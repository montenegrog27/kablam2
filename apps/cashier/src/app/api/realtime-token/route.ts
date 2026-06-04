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

export async function GET(request: Request) {
  const secret = process.env.REALTIME_JWT_SECRET;
  const branchId = new URL(request.url).searchParams.get("branchId");

  if (!secret) {
    return NextResponse.json({ error: "realtime_secret_not_configured" }, { status: 500 });
  }

  if (!branchId) {
    return NextResponse.json({ error: "branch_id_required" }, { status: 400 });
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

  if (!userRecord?.tenant_id) {
    return NextResponse.json({ error: "user_not_found" }, { status: 403 });
  }

  const canUseBranch = ["owner", "admin"].includes(userRecord.role) || userRecord.branch_id === branchId;
  if (!canUseBranch) {
    return NextResponse.json({ error: "branch_forbidden" }, { status: 403 });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = signRealtimeToken(
    {
      sub: userRecord.id,
      tenantId: userRecord.tenant_id,
      branchIds: [branchId],
      role: userRecord.role,
      iat: now,
      exp: now + 8 * 60 * 60,
    },
    secret,
  );

  return NextResponse.json({ token });
}
