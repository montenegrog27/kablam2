import { authErrorStatus, getAdminUser } from "@/lib/ads-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InsightRow = {
  spend?: number | string | null;
  impressions?: number | string | null;
  clicks?: number | string | null;
  inline_link_clicks?: number | string | null;
  purchases?: number | string | null;
  purchase_value?: number | string | null;
  leads?: number | string | null;
  date?: string;
};

type InsightTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  inline_link_clicks: number;
  purchases: number;
  purchase_value: number;
  leads: number;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function maskToken(value?: string | null) {
  if (!value) return "";
  if (value.length <= 12) return "****";
  return `${value.slice(0, 8)}****${value.slice(-6)}`;
}

export async function GET(req: NextRequest) {
  const auth = await getAdminUser(req, ["owner", "admin", "manager"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: authErrorStatus(auth.error) });
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceDate = since.toISOString().slice(0, 10);

  const [integrationRes, accountsRes, campaignsRes, insightsRes, syncRunsRes, audiencesRes] = await Promise.all([
    auth.supabase
      .from("tenant_integrations")
      .select("id, provider, access_token, status, metadata, updated_at")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("provider", "meta_ads")
      .maybeSingle(),
    auth.supabase
      .from("ad_accounts")
      .select("id, provider_account_id, name, currency, timezone_name, business_name, status, is_primary, last_synced_at")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("provider", "meta")
      .order("is_primary", { ascending: false }),
    auth.supabase
      .from("ad_campaigns")
      .select("id, ad_account_id, provider_campaign_id, name, objective, status, effective_status, daily_budget, lifetime_budget, last_synced_at")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("provider", "meta")
      .order("updated_at", { ascending: false })
      .limit(100),
    auth.supabase
      .from("ad_insights_daily")
      .select("date, spend, impressions, clicks, inline_link_clicks, purchases, purchase_value, leads")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("provider", "meta")
      .gte("date", sinceDate),
    auth.supabase
      .from("ad_sync_runs")
      .select("id, status, sync_type, started_at, finished_at, accounts_count, campaigns_count, insights_count, error")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("provider", "meta")
      .order("started_at", { ascending: false })
      .limit(5),
    auth.supabase
      .from("ad_audiences")
      .select("id, provider_audience_id, name, subtype, size_lower_bound, size_upper_bound, delivery_status, operation_status, source")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("provider", "meta")
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  if (accountsRes.error) return NextResponse.json({ error: accountsRes.error.message }, { status: 500 });
  if (campaignsRes.error) return NextResponse.json({ error: campaignsRes.error.message }, { status: 500 });
  if (insightsRes.error) return NextResponse.json({ error: insightsRes.error.message }, { status: 500 });

  const insightRows = (insightsRes.data || []) as InsightRow[];
  const totals = insightRows.reduce<InsightTotals>(
    (acc, row) => {
      acc.spend += toNumber(row.spend);
      acc.impressions += toNumber(row.impressions);
      acc.clicks += toNumber(row.clicks);
      acc.inline_link_clicks += toNumber(row.inline_link_clicks);
      acc.purchases += toNumber(row.purchases);
      acc.purchase_value += toNumber(row.purchase_value);
      acc.leads += toNumber(row.leads);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, inline_link_clicks: 0, purchases: 0, purchase_value: 0, leads: 0 },
  );

  const byDate = new Map<string, { date: string; spend: number; purchase_value: number; clicks: number }>();
  insightRows.forEach((row) => {
    if (!row.date) return;
    const current = byDate.get(row.date) || { date: row.date, spend: 0, purchase_value: 0, clicks: 0 };
    current.spend += toNumber(row.spend);
    current.purchase_value += toNumber(row.purchase_value);
    current.clicks += toNumber(row.clicks);
    byDate.set(row.date, current);
  });

  const integration = integrationRes.data as { access_token?: string | null; status?: string; metadata?: Record<string, unknown>; updated_at?: string } | null;

  return NextResponse.json({
    integration: integration
      ? {
          status: integration.status,
          updated_at: integration.updated_at,
          token_masked: maskToken(integration.access_token),
          metadata: integration.metadata || {},
        }
      : null,
    accounts: accountsRes.data || [],
    campaigns: campaignsRes.data || [],
    insights: {
      totals: {
        ...totals,
        roas: totals.spend > 0 ? totals.purchase_value / totals.spend : 0,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
        cpa: totals.purchases > 0 ? totals.spend / totals.purchases : 0,
      },
      byDate: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
    },
    audiences: audiencesRes.data || [],
    syncRuns: syncRunsRes.data || [],
  });
}
