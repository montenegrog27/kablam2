import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPERADMIN_EMAIL = process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function maskToken(value?: string | null) {
  if (!value) return "";
  if (value.length <= 12) return "••••";
  return `${value.slice(0, 8)}••••${value.slice(-6)}`;
}

async function getSuperadmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "unauthorized" as const };

  const supabase = serviceClient();
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user || data.user.email !== SUPERADMIN_EMAIL) {
    return { error: "forbidden" as const };
  }

  return { supabase, user: data.user };
}

export async function GET(req: NextRequest) {
  const auth = await getSuperadmin(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "forbidden" ? 403 : 401 });
  }

  const { data: tenants, error: tenantsError } = await auth.supabase
    .from("tenants")
    .select("id, name, slug")
    .order("name");
  if (tenantsError) return NextResponse.json({ error: tenantsError.message }, { status: 500 });

  const { data: integrations, error: integrationsError } = await auth.supabase
    .from("tenant_integrations")
    .select("id, tenant_id, provider, access_token, public_key, status, updated_at")
    .eq("provider", "mercadopago");
  if (integrationsError) return NextResponse.json({ error: integrationsError.message }, { status: 500 });

  return NextResponse.json({
    tenants: tenants || [],
    integrations: (integrations || []).map((integration) => ({
      ...integration,
      access_token: undefined,
      access_token_masked: maskToken(integration.access_token),
      public_key_masked: maskToken(integration.public_key),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await getSuperadmin(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "forbidden" ? 403 : 401 });
  }

  const body = await req.json();
  const tenantId = String(body.tenantId || "");
  const accessToken = String(body.accessToken || "").trim();
  const publicKey = String(body.publicKey || "").trim();
  const status = String(body.status || "active");

  if (!tenantId) return NextResponse.json({ error: "tenant_required" }, { status: 400 });

  const payload: Record<string, any> = {
    tenant_id: tenantId,
    provider: "mercadopago",
    status,
    updated_at: new Date().toISOString(),
  };
  if (accessToken) payload.access_token = accessToken;
  if (publicKey) payload.public_key = publicKey;

  const { data, error } = await auth.supabase
    .from("tenant_integrations")
    .upsert(payload, { onConflict: "tenant_id,provider" })
    .select("id, tenant_id, provider, access_token, public_key, status, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    integration: {
      ...data,
      access_token: undefined,
      access_token_masked: maskToken(data.access_token),
      public_key_masked: maskToken(data.public_key),
    },
  });
}
