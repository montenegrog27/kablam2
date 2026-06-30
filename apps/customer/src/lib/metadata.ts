import type { Metadata } from "next";

type CustomerMetaInput = {
  title?: string | null;
  fallbackTitle?: string | null;
  description?: string | null;
  faviconUrl?: string | null;
  appIconUrl?: string | null;
  manifestUrl?: string | null;
  ogImage?: string | null;
};

export function normalizeAssetUrl(url?: string | null) {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function buildCustomerMetadata({
  title,
  fallbackTitle,
  description,
  faviconUrl,
  appIconUrl,
  manifestUrl,
  ogImage,
}: CustomerMetaInput): Metadata {
  const metaTitle = title?.trim() || fallbackTitle?.trim() || "Kablam";
  const normalizedFaviconUrl = normalizeAssetUrl(faviconUrl);
  const normalizedAppIconUrl = normalizeAssetUrl(appIconUrl) || normalizedFaviconUrl;
  const normalizedOgImage = normalizeAssetUrl(ogImage);
  const openGraph: Metadata["openGraph"] = {
    title: metaTitle,
    description: description || `Pedidos online de ${metaTitle}`,
  };
  if (normalizedOgImage) {
    openGraph.images = [{ url: normalizedOgImage, width: 1200, height: 630 }];
  }
  const metadata: Metadata = {
    title: metaTitle,
    description: description || `Pedidos online de ${metaTitle}`,
    applicationName: metaTitle,
    appleWebApp: {
      capable: true,
      title: metaTitle,
      statusBarStyle: "black-translucent",
    },
    formatDetection: {
      telephone: false,
    },
    openGraph,
    other: {
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-title": metaTitle,
    },
  };

  if (manifestUrl) {
    metadata.manifest = manifestUrl;
  }

  if (normalizedFaviconUrl || normalizedAppIconUrl) {
    metadata.icons = {
      icon: normalizedFaviconUrl || normalizedAppIconUrl || undefined,
      shortcut: normalizedFaviconUrl || normalizedAppIconUrl || undefined,
      apple: normalizedAppIconUrl
        ? [
            { url: normalizedAppIconUrl, sizes: "180x180", type: "image/png" },
            { url: normalizedAppIconUrl, sizes: "192x192", type: "image/png" },
          ]
        : undefined,
    };
  }

  return metadata;
}
