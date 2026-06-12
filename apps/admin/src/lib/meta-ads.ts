const META_API_VERSION = process.env.META_API_VERSION || "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const META_DIALOG_BASE = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;
const META_SCOPES = ["ads_read", "ads_management", "business_management"].join(",");

export type MetaAction = {
  action_type?: string;
  value?: string;
};

export type MetaAdAccount = {
  id: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  business?: { name?: string };
};

export type MetaCampaign = {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  buying_type?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
};

export type MetaInsight = {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

type MetaListResponse<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number };
};

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string };
};

export function getMetaConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error("missing_meta_env");
  }

  return { appId, appSecret, redirectUri };
}

export function buildMetaAuthUrl(state: string) {
  const { appId, redirectUri } = getMetaConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: META_SCOPES,
    response_type: "code",
  });

  return `${META_DIALOG_BASE}?${params.toString()}`;
}

export async function exchangeCodeForLongLivedToken(code: string) {
  const { appId, appSecret, redirectUri } = getMetaConfig();
  const shortParams = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const shortToken = await metaFetch<TokenResponse>(`${META_GRAPH_BASE}/oauth/access_token?${shortParams.toString()}`);
  if (!shortToken.access_token) throw new Error(shortToken.error?.message || "meta_short_token_failed");

  const longParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken.access_token,
  });
  const longToken = await metaFetch<TokenResponse>(`${META_GRAPH_BASE}/oauth/access_token?${longParams.toString()}`);
  if (!longToken.access_token) throw new Error(longToken.error?.message || "meta_long_token_failed");

  return longToken;
}

export async function fetchMetaAdAccounts(accessToken: string) {
  return fetchMetaList<MetaAdAccount>(
    `${META_GRAPH_BASE}/me/adaccounts`,
    accessToken,
    "id,name,account_status,currency,timezone_name,business{name}",
  );
}

export async function fetchMetaCampaigns(accessToken: string, accountId: string) {
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  return fetchMetaList<MetaCampaign>(
    `${META_GRAPH_BASE}/${normalizedId}/campaigns`,
    accessToken,
    "id,name,objective,status,effective_status,buying_type,daily_budget,lifetime_budget,start_time,stop_time",
  );
}

export async function fetchMetaCampaignInsights(accessToken: string, accountId: string, since: string, until: string) {
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: [
      "campaign_id",
      "campaign_name",
      "date_start",
      "date_stop",
      "spend",
      "impressions",
      "reach",
      "clicks",
      "inline_link_clicks",
      "ctr",
      "cpc",
      "cpm",
      "actions",
      "action_values",
    ].join(","),
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });

  return fetchMetaListFromUrl<MetaInsight>(`${META_GRAPH_BASE}/${normalizedId}/insights?${params.toString()}`);
}

export function parseMetaMoney(value?: string | number | null) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function parseMetaInt(value?: string | number | null) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

export function sumAction(actions: MetaAction[] | undefined, names: string[]) {
  return (actions || [])
    .filter((action) => action.action_type && names.includes(action.action_type))
    .reduce((sum, action) => sum + parseMetaMoney(action.value), 0);
}

async function fetchMetaList<T>(baseUrl: string, accessToken: string, fields: string) {
  const params = new URLSearchParams({ access_token: accessToken, fields, limit: "500" });
  return fetchMetaListFromUrl<T>(`${baseUrl}?${params.toString()}`);
}

async function fetchMetaListFromUrl<T>(url: string) {
  const rows: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const json: MetaListResponse<T> = await metaFetch<MetaListResponse<T>>(nextUrl);
    if (json.error) throw new Error(json.error.message || "meta_api_error");
    rows.push(...(json.data || []));
    nextUrl = json.paging?.next;
  }

  return rows;
}

async function metaFetch<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const json = (await response.json()) as T;
  if (!response.ok) {
    const maybeError = json as { error?: { message?: string } };
    throw new Error(maybeError.error?.message || `meta_http_${response.status}`);
  }
  return json;
}
