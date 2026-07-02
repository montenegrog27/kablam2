type SupabaseLike = {
  from: (table: string) => any;
};

export type ResolvedCashierTenant = {
  id: string;
  name: string;
  slug: string;
};

function stripPort(host: string) {
  return host.toLowerCase().split(":")[0].trim();
}

function withoutWww(host: string) {
  return host.startsWith("www.") ? host.slice(4) : host;
}

function withoutCashier(host: string) {
  return host
    .replace(/^caja\./, "")
    .replace(/^cashier\./, "")
    .replace(/^pos\./, "");
}

function getPlatformDomain() {
  return (
    process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ||
    process.env.PLATFORM_ROOT_DOMAIN ||
    "kablam.com"
  )
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

export function normalizeCashierHost(host: string) {
  return withoutWww(stripPort(host));
}

function getPlatformTenantSlug(host: string) {
  const normalizedHost = normalizeCashierHost(host);
  const platformDomain = getPlatformDomain();

  if (normalizedHost === platformDomain) return null;
  if (!normalizedHost.endsWith(`.${platformDomain}`)) return null;

  const subdomain = normalizedHost.slice(0, -(platformDomain.length + 1));
  if (!subdomain || subdomain.includes(".")) return null;
  return subdomain;
}

function getFallbackTenantSlugForHost(host: string) {
  const normalizedHost = normalizeCashierHost(host);
  const fallbackSlug = (
    process.env.CASHIER_FALLBACK_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_CASHIER_FALLBACK_TENANT_SLUG ||
    ""
  ).trim();

  const fallbackHosts = (
    process.env.CASHIER_FALLBACK_HOSTS ||
    process.env.NEXT_PUBLIC_CASHIER_FALLBACK_HOSTS ||
    ""
  )
    .split(",")
    .map((item) => normalizeCashierHost(item))
    .filter(Boolean);

  return fallbackSlug && fallbackHosts.includes(normalizedHost) ? fallbackSlug : null;
}

function getDomainCandidates(host: string) {
  const normalizedHost = normalizeCashierHost(host);
  const customerHost = withoutCashier(normalizedHost);

  return [
    stripPort(host),
    normalizedHost,
    customerHost,
    `www.${customerHost}`,
  ].filter(Boolean);
}

export function isLocalCashierHost(host: string) {
  const normalizedHost = normalizeCashierHost(host);
  return (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost.includes("kablam2-")
  );
}

export async function resolveCashierTenantFromHost(
  supabase: SupabaseLike,
  host: string,
): Promise<ResolvedCashierTenant | null> {
  if (!host) return null;

  const fallbackSlug = getFallbackTenantSlugForHost(host);
  if (fallbackSlug) {
    const { data } = await supabase
      .from("tenants")
      .select("id,name,slug")
      .eq("slug", fallbackSlug)
      .maybeSingle();
    if (data) return data;
  }

  if (isLocalCashierHost(host)) return null;

  const domainCandidates = [...new Set(getDomainCandidates(host))];
  const { data: domainRows, error: domainError } = await supabase
    .from("tenant_domains")
    .select("domain, tenants(id,name,slug)")
    .in("domain", domainCandidates)
    .eq("is_active", true)
    .limit(1);

  if (!domainError && domainRows?.[0]?.tenants) {
    const tenant = Array.isArray(domainRows[0].tenants)
      ? domainRows[0].tenants[0]
      : domainRows[0].tenants;
    if (tenant) return tenant;
  }

  const normalizedHost = normalizeCashierHost(host);
  const customerHost = withoutCashier(normalizedHost);
  const platformSlug =
    getPlatformTenantSlug(normalizedHost) ||
    getPlatformTenantSlug(customerHost);

  if (platformSlug) {
    const { data } = await supabase
      .from("tenants")
      .select("id,name,slug")
      .eq("slug", platformSlug)
      .maybeSingle();
    return data || null;
  }

  const firstDomainPart = customerHost.split(".")[0];
  if (firstDomainPart) {
    const { data } = await supabase
      .from("tenants")
      .select("id,name,slug")
      .eq("slug", firstDomainPart)
      .maybeSingle();
    return data || null;
  }

  return null;
}
