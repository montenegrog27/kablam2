// Quick test script for upsell functionality
// Run with: node test_upsell.js
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "apps/customer/.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUpsell() {
  console.log("Testing upsell system...");

  // 1. Get branch santafe1583
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, tenant_id")
    .eq("slug", "santafe1583")
    .single();

  if (branchError) {
    console.error("Error fetching branch:", branchError);
    return;
  }

  console.log("Branch:", branch);

  // 2. Get upsell rules for tenant
  const { data: rules, error: rulesError } = await supabase
    .from("upsell_rules")
    .select(
      `
      id,
      tenant_id,
      category_id,
      suggested_category_id,
      discount,
      is_active,
      display_order,
      category:categories!upsell_rules_category_id_fkey(name),
      suggested_category:categories!upsell_rules_suggested_category_id_fkey(name)
    `,
    )
    .eq("tenant_id", branch.tenant_id)
    .eq("is_active", true)
    .order("display_order");

  if (rulesError) {
    console.error("Error fetching rules:", rulesError);
    return;
  }

  console.log("Upsell rules:", rules.length);
  rules.forEach((rule) => {
    console.log(
      `- ${rule.category?.name} → ${rule.suggested_category?.name} ($${rule.discount} descuento)`,
    );
  });

  // 3. Get products in suggested category (Bebidas sin alcohol)
  const suggestedCategoryId = "801747ab-4333-42c7-b995-cb122331f01a";
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      category_id,
      is_suggestable,
      show_in_menu,
      is_active,
      product_variants(id, name, price, is_default)
    `,
    )
    .eq("branch_id", branch.id)
    .eq("category_id", suggestedCategoryId)
    .eq("is_active", true)
    .or("is_suggestable.eq.true,show_in_menu.eq.false");

  if (productsError) {
    console.error("Error fetching products:", productsError);
    return;
  }

  console.log("Products in Bebidas sin alcohol category:", products.length);
  products.forEach((p) => {
    console.log(
      `- ${p.name} (suggestable: ${p.is_suggestable}, show_in_menu: ${p.show_in_menu})`,
    );
  });

  // 4. Get all suggestable products in branch (including show_in_menu = false)
  const { data: allSuggestable, error: allError } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      category_id,
      is_suggestable,
      show_in_menu,
      is_active
    `,
    )
    .eq("branch_id", branch.id)
    .eq("is_active", true)
    .or("is_suggestable.eq.true,show_in_menu.eq.false");

  if (allError) {
    console.error("Error fetching all suggestable:", allError);
    return;
  }

  console.log(
    "All suggestable products (including show_in_menu = false):",
    allSuggestable.length,
  );
  const nonMenu = allSuggestable.filter((p) => p.show_in_menu === false);
  console.log("Products with show_in_menu = false:", nonMenu.length);

  // 5. Check RLS policies for upsell_rules
  const { data: policies, error: policiesError } = await supabase
    .rpc("get_policies", { table_name: "upsell_rules" })
    .catch(() => ({ data: null, error: "RPC not available" }));

  console.log(
    "RLS check:",
    policiesError ? "Cannot check" : "Policies available",
  );
}

testUpsell().catch(console.error);
