import CumpleMordiscoClient from "./CumpleMordiscoClient";

export default async function CumpleMordiscoPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = await params;
  return <CumpleMordiscoClient branchSlug={branchSlug} />;
}
