import { loadMenuServer } from "@/lib/loadMenu";
import MenuPageClient from "./MenuPageClient";
import { createSupabaseServer } from "@kablam/supabase/server";
import { getCustomerSession } from "@/lib/customer-session";
import type { Product } from "@/types/menu";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  try {
    const supabase = await createSupabaseServer();

    const { branchSlug } = await params;
    console.log("Loading order page for branch:", branchSlug);

    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("*")
      .eq("slug", branchSlug)
      .single();

    if (branchError) {
      console.error("Error fetching branch:", branchError);
      throw new Error(`Error loading branch: ${branchError.message}`);
    }

    if (!branch) {
      throw new Error(`Branch not found for slug: ${branchSlug}`);
    }

    console.log("Branch found:", branch.id, branch.name);

    const { data: settings } = await supabase
      .from("branch_settings")
      .select("*")
      .eq("branch_id", branch.id)
      .single();

    console.log("Loading menu for branch:", branch.id);
    const menu: Product[] = await loadMenuServer(branchSlug);
    console.log("Menu loaded with", menu.length, "products");

    // Obtener sesión del cliente si existe y corresponde a esta sucursal
    let customer = null;
    const session = await getCustomerSession();
    if (session && session.branchId === branch.id) {
      customer = {
        name: session.name,
        phone: session.phone,
      };
      console.log("Customer session found:", session.customerId);
    } else if (session) {
      console.log("Session exists but for different branch, ignoring");
    }

    return (
      <MenuPageClient
        initialMenu={menu}
        branding={settings ? JSON.parse(JSON.stringify(settings)) : undefined}
        branchSlug={branchSlug}
        customer={customer}
      />
    );
  } catch (error: unknown) {
    console.error("Error in OrderPage:", error);
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">Error loading menu</h1>
        <p className="mt-2">
          Branch slug: {params ? (await params).branchSlug : "unknown"}
        </p>
        <p className="mt-2 text-gray-700">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <pre className="mt-4 p-4 bg-gray-100 rounded text-sm overflow-auto">
          {JSON.stringify(error, null, 2)}
        </pre>
      </div>
    );
  }
}
