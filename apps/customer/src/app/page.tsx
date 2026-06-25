import { headers } from "next/headers";
import {
  Bike,
  CalendarDays,
  Coffee,
  Gift,
  Globe,
  Instagram,
  Link as LinkIcon,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingBag,
  Star,
  Store,
  Ticket,
  Utensils,
} from "lucide-react";
import { createSupabaseServer } from "@kablam/supabase/server";
import { getBrandFontFamily, getFontCss, getGoogleFontFamily } from "@/lib/fonts";
import { buildCustomerMetadata } from "@/lib/metadata";
import { normalizeHost, resolveTenantFromHost } from "../lib/tenant-resolution";
import CustomerInitialLoader from "./components/CustomerInitialLoader";

type Branch = {
  id: string;
  name: string;
  slug: string;
};

type HubLink = {
  id: string;
  label: string;
  url: string;
  icon: string;
};

function getIcon(icon: string) {
  if (icon === "calendar" || icon === "reservations" || icon === "reserva") return CalendarDays;
  if (icon === "delivery" || icon === "moto") return Bike;
  if (icon === "whatsapp") return MessageCircle;
  if (icon === "order") return ShoppingBag;
  if (icon === "menu") return Utensils;
  if (icon === "store") return Store;
  if (icon === "coffee") return Coffee;
  if (icon === "ticket" || icon === "event") return Ticket;
  if (icon === "gift" || icon === "promo") return Gift;
  if (icon === "instagram") return Instagram;
  if (icon === "map") return MapPin;
  if (icon === "contact") return Mail;
  if (icon === "phone") return Phone;
  if (icon === "web") return Globe;
  if (icon === "featured") return Star;
  return LinkIcon;
}

function isExternalUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

async function getTenantHubBranding() {
  const supabase = await createSupabaseServer();
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const tenant = await resolveTenantFromHost(supabase, host);

  if (!tenant) return null;

  const { data: branches } = await supabase
    .from("branches")
    .select("id,name,slug")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("name");

  const activeBranches = (branches || []) as Branch[];
  const brandingBranch =
    activeBranches.find((branch) => branch.slug === "santafe1583") || activeBranches[0];

  if (!brandingBranch) {
    return { tenant, branch: null, settings: null };
  }

  const { data: settings } = await supabase
    .from("branch_settings")
    .select("meta_title, favicon_url")
    .eq("branch_id", brandingBranch.id)
    .maybeSingle();

  return { tenant, branch: brandingBranch, settings };
}

export async function generateMetadata() {
  const branding = await getTenantHubBranding();

  return buildCustomerMetadata({
    title: branding?.settings?.meta_title,
    fallbackTitle: branding?.tenant?.name,
    faviconUrl: branding?.settings?.favicon_url,
  });
}

export default async function Landing() {
  const supabase = await createSupabaseServer();
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const tenant = await resolveTenantFromHost(supabase, host);

  if (!tenant) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 px-6 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Tenant no encontrado</h1>
          <p className="mt-2 text-sm text-gray-400">
            No hay un negocio configurado para {normalizeHost(host)}.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: branches }, { data: hubSettings }, { data: hubLinks }] = await Promise.all([
    supabase
      .from("branches")
      .select("id,name,slug")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("customer_hub_settings")
      .select("*")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabase
      .from("customer_hub_links")
      .select("id,label,url,icon")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const activeBranches = (branches || []) as Branch[];
  const brandingBranch =
    activeBranches.find((branch) => branch.slug === "santafe1583") || activeBranches[0];
  const { data: branchSettings } = brandingBranch
    ? await supabase
        .from("branch_settings")
        .select("logo_url, loading_icon_url, primary_color, brand_color, background_color, font_family, font_primary, font_url")
        .eq("branch_id", brandingBranch.id)
        .maybeSingle()
    : { data: null };

  const accentColor =
    hubSettings?.accent_color ||
    branchSettings?.brand_color ||
    branchSettings?.primary_color ||
    "#111827";
  const backgroundColor =
    hubSettings?.background_color || branchSettings?.background_color || "#f8fafc";
  const textColor = hubSettings?.text_color || "#111827";
  const logoUrl = hubSettings?.logo_url || branchSettings?.logo_url;
  const title = hubSettings?.title || tenant.name;
  const subtitle =
    hubSettings?.subtitle || "Elegi como queres seguir. Pedi online, escribinos o encontranos.";
  const showBranchOrderLinks = hubSettings?.show_branch_order_links !== false;
  const configuredFontFamily =
    branchSettings?.font_family ||
    branchSettings?.font_primary ||
    hubSettings?.font_family ||
    "";
  const fontUrl = branchSettings?.font_url || hubSettings?.font_url;
  const googleFontFamily = getGoogleFontFamily(fontUrl);
  const loadedFontFamily = googleFontFamily || configuredFontFamily || "TenantFont";
  const appliedFontFamily = getBrandFontFamily({
    font_family: configuredFontFamily,
    font_url: fontUrl,
  });
  const links = (hubLinks || []) as HubLink[];

  return (
    <main
      className="min-h-screen px-5 py-8"
      style={{ background: backgroundColor, color: textColor, fontFamily: appliedFontFamily }}
    >
      <CustomerInitialLoader
        branding={branchSettings ? JSON.parse(JSON.stringify(branchSettings)) : undefined}
        branchSlug={brandingBranch?.slug || "home"}
      />
      {fontUrl?.includes("fonts.googleapis.com") ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontUrl} />
        </>
      ) : fontUrl ? (
        <style
          dangerouslySetInnerHTML={{
            __html: getFontCss(fontUrl, loadedFontFamily),
          }}
        />
      ) : null}
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col">
        <section className="flex flex-1 flex-col justify-center">
          <div className="text-center">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={title}
                className="mx-auto h-28 w-28 rounded-full object-cover shadow-xl ring-4 ring-white/70"
              />
            ) : (
              <div
                className="mx-auto flex h-28 w-28 items-center justify-center rounded-full text-4xl font-black text-white shadow-xl"
                style={{ background: accentColor }}
              >
                {title.slice(0, 1)}
              </div>
            )}

            <h1
              className="mt-6 text-3xl font-bold tracking-normal"
              style={{ fontFamily: appliedFontFamily }}
            >
              {title}
            </h1>
            <p
              className="mx-auto mt-3 max-w-sm text-balance text-sm leading-6 opacity-70"
              style={{ fontFamily: appliedFontFamily }}
            >
              {subtitle}
            </p>
          </div>

          <div className="mt-9 space-y-3">
            {showBranchOrderLinks &&
              activeBranches.map((branch) => (
                <a
                  key={branch.id}
                  href={`/${branch.slug}/order`}
                  className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-lg transition active:scale-[0.99]"
                  style={{ background: accentColor }}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
                      <ShoppingBag size={18} />
                    </span>
                    <span className="truncate">Hacer pedido</span>
                  </span>
                  <span className="text-lg opacity-70 transition group-hover:translate-x-0.5">›</span>
                </a>
              ))}

            {links.map((link) => {
              const Icon = getIcon(link.icon);
              return (
                <a
                  key={link.id}
                  href={link.url}
                  target={isExternalUrl(link.url) ? "_blank" : undefined}
                  rel={isExternalUrl(link.url) ? "noreferrer" : undefined}
                                    style={{ background: accentColor }}

                  className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-sm font-bold shadow-sm backdrop-blur transition hover:bg-white active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: accentColor }}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="truncate text-white">{link.label}</span>
                  </span>
                  <span className="text-lg text-white opacity-70 transition group-hover:translate-x-0.5">›</span>
                </a>
              );
            })}
          </div>
        </section>

        <footer className="pt-8 text-center text-xs opacity-40">Powered by Kablam</footer>
      </div>
    </main>
  );
}
