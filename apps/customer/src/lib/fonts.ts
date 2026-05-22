import type { Branding } from "@/types/menu";

export function getGoogleFontFamily(fontUrl?: string | null) {
  if (!fontUrl || !fontUrl.includes("fonts.googleapis.com")) return null;

  try {
    const url = new URL(fontUrl);
    const family = url.searchParams.getAll("family")[0];
    if (!family) return null;

    return family.split(":")[0]?.replace(/\+/g, " ").trim() || null;
  } catch {
    const match = fontUrl.match(/[?&]family=([^&]+)/);
    return match?.[1]?.split(":")[0]?.replace(/\+/g, " ").trim() || null;
  }
}

export function getLoadedFontFamily(branding?: Pick<Branding, "font_family" | "font_primary" | "font_url"> | null) {
  return (
    getGoogleFontFamily(branding?.font_url) ||
    branding?.font_family ||
    branding?.font_primary ||
    "CustomFont"
  );
}

export function getBrandFontFamily(branding?: Pick<Branding, "font_family" | "font_primary" | "font_url"> | null) {
  const loadedFamily = getLoadedFontFamily(branding);
  const fallbackFamily = branding?.font_family || branding?.font_primary;

  return `'${loadedFamily}', ${fallbackFamily ? `'${fallbackFamily}', ` : ""}sans-serif`;
}

export function getFontCss(fontUrl?: string | null, fontFamily?: string | null) {
  if (!fontUrl || !fontFamily) return "";

  return fontUrl.includes("fonts.googleapis.com")
    ? `@import url('${fontUrl}');`
    : `@font-face { font-family: '${fontFamily}'; src: url('${fontUrl}'); font-display: swap; }`;
}
