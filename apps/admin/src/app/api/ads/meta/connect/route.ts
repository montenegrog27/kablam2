import { authErrorStatus, getAdminUser } from "@/lib/ads-auth";
import { buildMetaAuthUrl } from "@/lib/meta-ads";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAdminUser(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: authErrorStatus(auth.error) });
    }

    const state = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await auth.supabase.from("meta_oauth_states").insert({
      state,
      tenant_id: auth.user.tenant_id,
      user_id: auth.user.id,
      return_to: "/ads",
      expires_at: expiresAt,
    });

    if (error) {
      return NextResponse.json({ error: "oauth_state_create_failed", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ authUrl: buildMetaAuthUrl(state) });
  } catch (error) {
    return NextResponse.json(
      { error: "meta_connect_failed", details: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
