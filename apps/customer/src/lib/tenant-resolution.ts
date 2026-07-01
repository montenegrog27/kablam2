type SupabaseLike = {
  from: (table: string) => any;
};

export type ResolvedTenant = {
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

export function normalizeHost(host: string) {
  return withoutWww(stripPort(host));
}

export function getPlatformTenantSlug(host: string) {
  const normalizedHost = normalizeHost(host);
  const platformDomain = getPlatformDomain();

  if (normalizedHost === platformDomain) return null;
  if (!normalizedHost.endsWith(`.${platformDomain}`)) return null;

  const subdomain = normalizedHost.slice(0, -(platformDomain.length + 1));
  if (!subdomain || subdomain.includes(".")) return null;
  return subdomain;
}

function getFallbackTenantSlugForHost(host: string) {
  const normalizedHost = normalizeHost(host);
  const fallbackSlug = (
    process.env.CUSTOMER_FALLBACK_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_CUSTOMER_FALLBACK_TENANT_SLUG ||
    "kablam"
  ).trim();

  const fallbackHosts = (
    process.env.CUSTOMER_FALLBACK_HOSTS ||
    process.env.NEXT_PUBLIC_CUSTOMER_FALLBACK_HOSTS ||
    "kablam2-customer.vercel.app"
  )
    .split(",")
    .map((item) => normalizeHost(item))
    .filter(Boolean);

  return fallbackSlug && fallbackHosts.includes(normalizedHost) ? fallbackSlug : null;
}

export async function resolveTenantFromHost(
  supabase: SupabaseLike,
  host: string,
): Promise<ResolvedTenant | null> {
  const normalizedHost = normalizeHost(host);
  const fallbackSlug = getFallbackTenantSlugForHost(host);

  if (fallbackSlug) {
    const { data } = await supabase
      .from("tenants")
      .select("id,name,slug")
      .eq("slug", fallbackSlug)
      .maybeSingle();
    if (data) return data;
  }

  if (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1"
  ) {
    const { data } = await supabase
      .from("tenants")
      .select("id,name,slug")
      .eq("slug", "mordiscoburgers")
      .maybeSingle();
    return data || null;
  }

  const domainCandidates = [...new Set([stripPort(host), normalizedHost])];
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

  const platformSlug = getPlatformTenantSlug(normalizedHost);
  if (platformSlug) {
    const { data } = await supabase
      .from("tenants")
      .select("id,name,slug")
      .eq("slug", platformSlug)
      .maybeSingle();
    return data || null;
  }

  return null;
}
