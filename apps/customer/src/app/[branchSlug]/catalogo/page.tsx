import { notFound } from "next/navigation";
import FontLoader from "../../components/FontLoader";
import { buildCustomerMetadata } from "@/lib/metadata";
import { loadQrMenu } from "@/lib/loadQrMenu";
import CatalogPageClient from "./CatalogPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = await params;
  const data = await loadQrMenu(branchSlug);

  if (!data) {
    return buildCustomerMetadata({ fallbackTitle: "Catalogo" });
  }

  const iconUrl = data.branding?.loading_icon_url || data.branding?.logo_url;

  return buildCustomerMetadata({
    title: `Catalogo - ${data.branch.name}`,
    fallbackTitle: data.branch.name,
    faviconUrl: iconUrl,
    appIconUrl: iconUrl,
    manifestUrl: `/${branchSlug}/manifest.webmanifest`,
  });
}

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = await params;
  const data = await loadQrMenu(branchSlug);

  if (!data) notFound();

  return (
    <>
      <FontLoader branding={data.branding || undefined} />
      <CatalogPageClient data={data} branchSlug={branchSlug} />
    </>
  );
}
