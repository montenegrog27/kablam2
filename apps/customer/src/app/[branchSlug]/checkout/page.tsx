import { createSupabaseServer } from "@kablam/supabase/server";
import CheckoutPageClient from "./CheckoutPageClient";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { branchSlug } = await params;

  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("slug", branchSlug)
    .single();

  let branding = undefined;
  if (branch) {
    const { data: settings } = await supabase
      .from("branch_settings")
      .select("*")
      .eq("branch_id", branch.id)
      .single();

    if (settings) {
      branding = JSON.parse(JSON.stringify(settings));
    }
  }

  return <CheckoutPageClient branchSlug={branchSlug} branding={branding} />;
}
