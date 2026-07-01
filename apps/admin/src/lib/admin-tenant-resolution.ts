type SupabaseLike = {
  from: (table: string) => any;
};

export type ResolvedAdminTenant = {
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

function withoutAdmin(host: string) {
  return host.startsWith("admin.") ? host.slice(6) : host;
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

export function normalizeAdminHost(host: string) {
  return withoutWww(stripPort(host));
}

function getPlatformTenantSlug(host: string) {
  const normalizedHost = normalizeAdminHost(host);
  const platformDomain = getPlatformDomain();

  if (normalizedHost === platformDomain) return null;
  if (!normalizedHost.endsWith(`.${platformDomain}`)) return null;

  const subdomain = normalizedHost.slice(0, -(platformDomain.length + 1));
  if (!subdomain || subdomain.includes(".")) return null;
  return subdomain;
}

function getFallbackTenantSlugForHost(host: string) {
  const normalizedHost = normalizeAdminHost(host);
  const fallbackSlug = (
    process.env.ADMIN_FALLBACK_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_ADMIN_FALLBACK_TENANT_SLUG ||
    "kablam"
  ).trim();

  const fallbackHosts = (
    process.env.ADMIN_FALLBACK_HOSTS ||
    process.env.NEXT_PUBLIC_ADMIN_FALLBACK_HOSTS ||
    "kablam2-admin.vercel.app"
  )
    .split(",")
    .map((item) => normalizeAdminHost(item))
    .filter(Boolean);

  return fallbackSlug && fallbackHosts.includes(normalizedHost) ? fallbackSlug : null;
}

function getDomainCandidates(host: string) {
  const normalizedHost = normalizeAdminHost(host);
  const customerHost = withoutAdmin(normalizedHost);

  return [
    stripPort(host),
    normalizedHost,
    customerHost,
    `www.${customerHost}`,
  ].filter(Boolean);
}

export function isLocalAdminHost(host: string) {
  const normalizedHost = normalizeAdminHost(host);
  return (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost.includes("kablam2-")
  );
}

export async function resolveAdminTenantFromHost(
  supabase: SupabaseLike,
  host: string,
): Promise<ResolvedAdminTenant | null> {
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

  if (isLocalAdminHost(host)) return null;

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

  const normalizedHost = normalizeAdminHost(host);
  const platformSlug =
    getPlatformTenantSlug(normalizedHost) ||
    getPlatformTenantSlug(withoutAdmin(normalizedHost));

  if (platformSlug) {
    const { data } = await supabase
      .from("tenants")
      .select("id,name,slug")
      .eq("slug", platformSlug)
      .maybeSingle();
    return data || null;
  }

  const customerHost = withoutAdmin(normalizedHost);
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
