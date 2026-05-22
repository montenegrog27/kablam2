import type { Metadata } from "next";

type CustomerMetaInput = {
  title?: string | null;
  fallbackTitle?: string | null;
  description?: string | null;
  faviconUrl?: string | null;
};

function normalizeAssetUrl(url?: string | null) {
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
}: CustomerMetaInput): Metadata {
  const metaTitle = title?.trim() || fallbackTitle?.trim() || "Kablam";
  const normalizedFaviconUrl = normalizeAssetUrl(faviconUrl);
  const metadata: Metadata = {
    title: metaTitle,
    description: description || `Pedidos online de ${metaTitle}`,
    openGraph: {
      title: metaTitle,
      description: description || `Pedidos online de ${metaTitle}`,
    },
  };

  if (normalizedFaviconUrl) {
    metadata.icons = {
      icon: normalizedFaviconUrl,
      shortcut: normalizedFaviconUrl,
      apple: normalizedFaviconUrl,
    };
  }

  return metadata;
}
