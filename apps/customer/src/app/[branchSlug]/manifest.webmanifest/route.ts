import { normalizeAssetUrl } from "@/lib/metadata";
import { createSupabaseServer } from "@kablam/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ branchSlug: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { branchSlug } = await params;
  const supabase = await createSupabaseServer();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("slug", branchSlug)
    .maybeSingle();

  if (!branch) {
    return NextResponse.json({ error: "branch_not_found" }, { status: 404 });
  }

  const { data: settings } = await supabase
    .from("branch_settings")
    .select("meta_title, favicon_url, loading_icon_url, logo_url, primary_color, brand_color, background_color")
    .eq("branch_id", branch.id)
    .maybeSingle();

  const appName = settings?.meta_title?.trim() || branch.name || "Kablam";
  const iconUrl = normalizeAssetUrl(settings?.favicon_url || settings?.loading_icon_url || settings?.logo_url);
  const themeColor = settings?.primary_color || settings?.brand_color || "#111827";
  const backgroundColor = settings?.background_color || "#ffffff";

  return NextResponse.json(
    {
      name: appName,
      short_name: appName.slice(0, 12),
      description: `Pedidos online de ${appName}`,
      start_url: `/${branchSlug}/order`,
      scope: `/${branchSlug}/`,
      display: "standalone",
      orientation: "portrait",
      theme_color: themeColor,
      background_color: backgroundColor,
      icons: iconUrl
        ? [
            { src: iconUrl, sizes: "180x180", type: "image/png", purpose: "any" },
            { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
            { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ]
        : [],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
        "Content-Type": "application/manifest+json",
      },
    },
  );
}
