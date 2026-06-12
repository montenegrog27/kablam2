import { authErrorStatus, getAdminUser } from "@/lib/ads-auth";
import {
  fetchMetaAdAccounts,
  fetchMetaCampaignInsights,
  fetchMetaCampaigns,
  parseMetaInt,
  parseMetaMoney,
  sumAction,
} from "@/lib/meta-ads";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IntegrationRow = {
  access_token?: string | null;
  status?: string;
};

type AccountRow = {
  id: string;
  provider_account_id: string;
};

type CampaignRow = {
  id: string;
  provider_campaign_id: string;
};

const PURCHASE_ACTIONS = ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"];
const LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

export async function POST(req: NextRequest) {
  const auth = await getAdminUser(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: authErrorStatus(auth.error) });
  }

  const now = new Date().toISOString();
  const { data: run } = await auth.supabase
    .from("ad_sync_runs")
    .insert({
      tenant_id: auth.user.tenant_id,
      provider: "meta",
      status: "running",
      sync_type: "manual",
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  try {
    const { data: integration, error: integrationError } = await auth.supabase
      .from("tenant_integrations")
      .select("access_token, status")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("provider", "meta_ads")
      .eq("status", "active")
      .maybeSingle();

    const metaIntegration = integration as IntegrationRow | null;
    if (integrationError || !metaIntegration?.access_token) {
      throw new Error("meta_not_connected");
    }

    const accessToken = metaIntegration.access_token;
    const accounts = await fetchMetaAdAccounts(accessToken);

    if (accounts.length > 0) {
      await auth.supabase.from("ad_accounts").upsert(
        accounts.map((account, index) => ({
          tenant_id: auth.user.tenant_id,
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

    const { data: accountRows } = await auth.supabase
      .from("ad_accounts")
      .select("id, provider_account_id")
      .eq("tenant_id", auth.user.tenant_id)
      .eq("provider", "meta");

    const persistedAccounts = (accountRows || []) as AccountRow[];
    let campaignsCount = 0;
    let insightsCount = 0;
    const until = new Date();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceText = since.toISOString().slice(0, 10);
    const untilText = until.toISOString().slice(0, 10);

    for (const account of persistedAccounts) {
      const campaigns = await fetchMetaCampaigns(accessToken, account.provider_account_id);
      campaignsCount += campaigns.length;

      if (campaigns.length > 0) {
        await auth.supabase.from("ad_campaigns").upsert(
          campaigns.map((campaign) => ({
            tenant_id: auth.user.tenant_id,
            ad_account_id: account.id,
            provider: "meta",
            provider_campaign_id: campaign.id,
            name: campaign.name || campaign.id,
            objective: campaign.objective || null,
            status: campaign.status || null,
            effective_status: campaign.effective_status || null,
            buying_type: campaign.buying_type || null,
            daily_budget: campaign.daily_budget ? parseMetaMoney(campaign.daily_budget) / 100 : null,
            lifetime_budget: campaign.lifetime_budget ? parseMetaMoney(campaign.lifetime_budget) / 100 : null,
            start_time: campaign.start_time || null,
            stop_time: campaign.stop_time || null,
            raw: campaign,
            last_synced_at: now,
            updated_at: now,
          })),
          { onConflict: "tenant_id,provider,provider_campaign_id" },
        );
      }

      const { data: campaignRows } = await auth.supabase
        .from("ad_campaigns")
        .select("id, provider_campaign_id")
        .eq("tenant_id", auth.user.tenant_id)
        .eq("provider", "meta");
      const campaignByProviderId = new Map(
        ((campaignRows || []) as CampaignRow[]).map((campaign) => [campaign.provider_campaign_id, campaign.id]),
      );

      const insights = await fetchMetaCampaignInsights(accessToken, account.provider_account_id, sinceText, untilText);
      insightsCount += insights.length;

      if (insights.length > 0) {
        await auth.supabase.from("ad_insights_daily").upsert(
          insights
            .filter((insight) => insight.campaign_id && insight.date_start)
            .map((insight) => ({
              tenant_id: auth.user.tenant_id,
              ad_account_id: account.id,
              ad_campaign_id: campaignByProviderId.get(String(insight.campaign_id)) || null,
              provider: "meta",
              provider_campaign_id: String(insight.campaign_id),
              date: insight.date_start,
              spend: parseMetaMoney(insight.spend),
              impressions: parseMetaInt(insight.impressions),
              reach: parseMetaInt(insight.reach),
              clicks: parseMetaInt(insight.clicks),
              inline_link_clicks: parseMetaInt(insight.inline_link_clicks),
              ctr: parseMetaMoney(insight.ctr),
              cpc: parseMetaMoney(insight.cpc),
              cpm: parseMetaMoney(insight.cpm),
              purchases: sumAction(insight.actions, PURCHASE_ACTIONS),
              purchase_value: sumAction(insight.action_values, PURCHASE_ACTIONS),
              leads: sumAction(insight.actions, LEAD_ACTIONS),
              raw: insight,
              updated_at: now,
            })),
          { onConflict: "tenant_id,provider,provider_campaign_id,date" },
        );
      }
    }

    if (run?.id) {
      await auth.supabase
        .from("ad_sync_runs")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          accounts_count: accounts.length,
          campaigns_count: campaignsCount,
          insights_count: insightsCount,
        })
        .eq("id", run.id);
    }

    return NextResponse.json({ ok: true, accounts: accounts.length, campaigns: campaignsCount, insights: insightsCount });
  } catch (error) {
    if (run?.id) {
      await auth.supabase
        .from("ad_sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : "unknown_error",
        })
        .eq("id", run.id);
    }

    return NextResponse.json(
      { error: "meta_sync_failed", details: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
