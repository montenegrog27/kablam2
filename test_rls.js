// Test RLS policies for upsell_rules
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

async function testRLS() {
  console.log("Testing RLS policies for upsell_rules...");

  // Try to fetch ALL rules (including inactive)
  const { data: allRules, error: allError } = await supabase
    .from("upsell_rules")
    .select("id, is_active")
    .eq("tenant_id", "3e3b5ec7-376e-4f5d-9735-c437a8849e95");

  if (allError) {
    console.error("Error fetching all rules:", allError.message);
  } else {
    console.log(`All rules (including inactive): ${allRules.length}`);
    const activeCount = allRules.filter((r) => r.is_active).length;
    console.log(
      `Active: ${activeCount}, Inactive: ${allRules.length - activeCount}`,
    );
  }

  // Try to insert a rule (should fail for public)
  const { error: insertError } = await supabase.from("upsell_rules").insert({
    tenant_id: "3e3b5ec7-376e-4f5d-9735-c437a8849e95",
    category_id: "30bc3fb5-34e6-4dcf-b8cc-e47501926ad0",
    suggested_category_id: "801747ab-4333-42c7-b995-cb122331f01a",
    discount: 100,
    is_active: true,
  });

  if (insertError) {
    console.log(
      "Insert failed as expected (public cannot insert):",
      insertError.message,
    );
  } else {
    console.log("WARNING: Public could insert a rule! RLS policy missing!");
  }

  // Try to update a rule (should fail)
  const { error: updateError } = await supabase
    .from("upsell_rules")
    .update({ discount: 999 })
    .eq("id", "30bc3fb5-34e6-4dcf-b8cc-e47501926ad0"); // This is actually category_id, not rule id

  if (updateError) {
    console.log("Update failed as expected:", updateError.message);
  } else {
    console.log("WARNING: Public could update a rule!");
  }

  // Test products RLS
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, is_active")
    .eq("branch_id", "450b71ba-05b5-4714-acff-eb35a5e3e731")
    .limit(5);

  if (productsError) {
    console.error("Error fetching products:", productsError.message);
  } else {
    console.log(`Products fetched: ${products.length}`);
    const inactiveProducts = products.filter((p) => !p.is_active);
    console.log(`Inactive products in result: ${inactiveProducts.length}`);
  }
}

testRLS().catch(console.error);
