// Test upsell suggestions with a mock cart
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

async function testCartSuggestions() {
  console.log("Testing upsell suggestions with cart...");

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

  // 2. Find category "Dobles con Papas" (category_id from upsell rule)
  const { data: rule, error: ruleError } = await supabase
    .from("upsell_rules")
    .select("category_id, suggested_category_id, discount")
    .eq("tenant_id", branch.tenant_id)
    .eq("is_active", true)
    .single();

  if (ruleError) {
    console.error("Error fetching rule:", ruleError);
    return;
  }

  console.log("Upsell rule:", rule);

  // 3. Get a product in the trigger category
  const { data: triggerProducts, error: triggerError } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      category_id,
      categories(id, name),
      product_variants(id, name, price, is_default)
    `,
    )
    .eq("branch_id", branch.id)
    .eq("category_id", rule.category_id)
    .eq("is_active", true)
    .limit(1);

  if (triggerError || !triggerProducts || triggerProducts.length === 0) {
    console.error(
      "No products found in trigger category. Need to create a test product.",
    );
    // Maybe create a test product in that category
    return;
  }

  const triggerProduct = triggerProducts[0];
  console.log(
    "Trigger product:",
    triggerProduct.name,
    "Category:",
    triggerProduct.categories?.name,
  );

  // 4. Simulate cart with this product
  const mockCartItem = {
    productId: triggerProduct.id,
    categories: triggerProduct.categories
      ? [{ id: triggerProduct.categories.id }]
      : [],
  };

  console.log("Mock cart item:", mockCartItem);

  // 5. Call getUpsellSuggestions logic (simplified)
  // We'll manually fetch suggestions
  const cartItems = [mockCartItem];

  // Get all suggestable products for branch
  const { data: allSuggestable, error: suggestableError } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      category_id,
      is_suggestable,
      show_in_menu,
      categories(id, name),
      product_variants(id, name, price, is_default)
    `,
    )
    .eq("branch_id", branch.id)
    .eq("is_active", true)
    .or("is_suggestable.eq.true,show_in_menu.eq.false");

  if (suggestableError) {
    console.error("Error fetching suggestable products:", suggestableError);
    return;
  }

  console.log(`Total suggestable products: ${allSuggestable.length}`);

  // Filter non-menu products (show_in_menu = false)
  const nonMenuProducts = allSuggestable.filter(
    (p) => p.show_in_menu === false,
  );
  console.log(`Non-menu products (complementary): ${nonMenuProducts.length}`);

  // Filter products in suggested category
  const suggestedCategoryProducts = allSuggestable.filter(
    (p) => p.category_id === rule.suggested_category_id,
  );
  console.log(
    `Products in suggested category: ${suggestedCategoryProducts.length}`,
  );

  // Calculate suggestions
  const suggestions = [];

  // Add non-menu products as complementary
  nonMenuProducts.forEach((product) => {
    suggestions.push({
      product,
      discount: 0,
      reason: "Producto complementario",
    });
  });

  // Add rule-based suggestions
  if (cartItems.length > 0) {
    const cartCategoryIds = cartItems
      .map((item) => item.categories?.[0]?.id)
      .filter(Boolean);
    if (cartCategoryIds.includes(rule.category_id)) {
      suggestedCategoryProducts.forEach((product) => {
        // Check if already added
        if (!suggestions.some((s) => s.product.id === product.id)) {
          suggestions.push({
            product,
            discount: rule.discount,
            reason: `Sugerido por comprar ${triggerProduct.categories?.name || "productos relacionados"}`,
          });
        }
      });
    }
  }

  console.log("\n=== SUGGESTIONS GENERATED ===");
  console.log(`Total suggestions: ${suggestions.length}`);
  suggestions.forEach((s, i) => {
    const variant = s.product.product_variants?.[0];
    console.log(
      `${i + 1}. ${s.product.name} - $${variant?.price || 0} (Descuento: $${s.discount}) - ${s.reason}`,
    );
  });
}

testCartSuggestions().catch(console.error);
