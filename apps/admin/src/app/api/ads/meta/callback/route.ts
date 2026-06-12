import { createSupabaseService } from "@/lib/ads-auth";
import { exchangeCodeForLongLivedToken, fetchMetaAdAccounts } from "@/lib/meta-ads";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OAuthStateRow = {
  state: string;
  tenant_id: string;
  user_id: string;
  return_to?: string | null;
  expires_at: string;
  used_at?: string | null;
};

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const denied = req.nextUrl.searchParams.get("error_reason") || req.nextUrl.searchParams.get("error");

  if (denied) {
    return NextResponse.redirect(`${origin}/ads?meta=denied`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/ads?meta=invalid_callback`);
  }

  const supabase = createSupabaseService();
  const { data: stateRow, error: stateError } = await supabase
    .from("meta_oauth_states")
    .select("state, tenant_id, user_id, return_to, expires_at, used_at")
    .eq("state", state)
    .single();

  const oauthState = stateRow as OAuthStateRow | null;
  if (stateError || !oauthState || oauthState.used_at || new Date(oauthState.expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(`${origin}/ads?meta=invalid_state`);
  }

  try {
    const token = await exchangeCodeForLongLivedToken(code);
    const accessToken = token.access_token;
    if (!accessToken) throw new Error("missing_access_token");

    const accounts = await fetchMetaAdAccounts(accessToken);
    const now = new Date().toISOString();
    const primaryAccount = accounts[0];

    await supabase.from("tenant_integrations").upsert(
      {
        tenant_id: oauthState.tenant_id,
        provider: "meta_ads",
        access_token: accessToken,
        status: "active",
        metadata: {
          token_type: token.token_type || "bearer",
          expires_in: token.expires_in || null,
          connected_at: now,
          connected_by: oauthState.user_id,
          primary_account_id: primaryAccount?.id || null,
          account_count: accounts.length,
        },
        updated_at: now,
      },
      { onConflict: "tenant_id,provider" },
    );

    if (accounts.length > 0) {
      await supabase.from("ad_accounts").upsert(
        accounts.map((account, index) => ({
          tenant_id: oauthState.tenant_id,
          provider: "meta",
          provider_account_id: account.id,
          name: account.name || account.id,
          currency: account.currency || null,
          timezone_name: account.timezone_name || null,
          business_name: account.business?.name || null,
          status: String(account.account_status || "active"),
          is_primary: index === 0,
          raw: account,
          last_synced_at: now,
          updated_at: now,
        })),
        { onConflict: "tenant_id,provider,provider_account_id" },
      );
    }

    await supabase.from("meta_oauth_states").update({ used_at: now }).eq("state", state);

    return NextResponse.redirect(`${origin}${oauthState.return_to || "/ads"}?meta=connected`);
  } catch (error) {
    await supabase.from("meta_oauth_states").update({ used_at: new Date().toISOString() }).eq("state", state);
    const details = encodeURIComponent(error instanceof Error ? error.message : "unknown_error");
    return NextResponse.redirect(`${origin}/ads?meta=error&details=${details}`);
  }
}
