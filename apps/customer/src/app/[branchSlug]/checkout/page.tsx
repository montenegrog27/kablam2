import { createSupabaseServer } from "@kablam/supabase/server";
import CheckoutPageClient from "./CheckoutPageClient";
import { getBranchAvailability } from "@/lib/branchAvailability";

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
  let availability = undefined;
  if (branch) {
    const { data: settings } = await supabase
      .from("branch_settings")
      .select("*")
      .eq("branch_id", branch.id)
      .single();

    if (settings) {
      branding = JSON.parse(JSON.stringify(settings));
    }

    const { data: branchHours } = await supabase
      .from("branch_hours")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("branch_id", branch.id);

    availability = getBranchAvailability({
      settings,
      hours: branchHours,
    });
  }

  return <CheckoutPageClient branchSlug={branchSlug} branding={branding} availability={availability} />;
}
