import type { Metadata } from "next";

type CustomerMetaInput = {
  title?: string | null;
  fallbackTitle?: string | null;
  description?: string | null;
  faviconUrl?: string | null;
};

export function buildCustomerMetadata({
  title,
  fallbackTitle,
  description,
  faviconUrl,
}: CustomerMetaInput): Metadata {
  const metaTitle = title?.trim() || fallbackTitle?.trim() || "Kablam";
  const metadata: Metadata = {
    title: metaTitle,
    description: description || `Pedidos online de ${metaTitle}`,
    openGraph: {
      title: metaTitle,
      description: description || `Pedidos online de ${metaTitle}`,
    },
  };

  if (faviconUrl?.trim()) {
    metadata.icons = {
      icon: faviconUrl,
      shortcut: faviconUrl,
      apple: faviconUrl,
    };
  }

  return metadata;
}
