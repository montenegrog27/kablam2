import { loadMenu } from "@/lib/loadMenu";
import MenuPageClient from "./MenuPageClient";
import { supabase } from "@kablam/supabase";
import type { Branding, Product } from "@/types/menu";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {

  const { branchSlug } = await params;

  /* =============================
     BUSCAR BRANCH
  ============================= */

  const { data: branch, error } = await supabase
    .from("branches")
    .select("*")
    .eq("slug", branchSlug)
    .single();

  if (!branch || error) {
    throw new Error(`Branch not found for slug: ${branchSlug}`);
  }

  /* =============================
     TRAER BRANDING
  ============================= */

  const { data: settings } = await supabase
    .from("branch_settings")
    .select("*")
    .eq("branch_id", branch.id)
    .single();
console.log("🔥 settings:", settings)
  /* =============================
     TRAER MENU
  ============================= */

  const menu: Product[] = await loadMenu(branchSlug);

  return (
    <MenuPageClient
      initialMenu={menu}
     branding={settings ? JSON.parse(JSON.stringify(settings)) : undefined}
       branchSlug={branchSlug} // 👈 AQUI
    />
  );
}