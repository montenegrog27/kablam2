// Script to create beverage products for testing upsell
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

async function createBeverageProducts() {
  const branchId = "450b71ba-05b5-4714-acff-eb35a5e3e731";
  const categoryId = "801747ab-4333-42c7-b995-cb122331f01a"; // Bebidas sin alcohol

  console.log("Creating beverage products...");

  const products = [
    {
      name: "Coca-Cola en Lata",
      description: "Lata 354ml",
      is_suggestable: true,
      show_in_menu: true,
      price: 1200,
    },
    {
      name: "Pepsi en Lata",
      description: "Lata 354ml",
      is_suggestable: true,
      show_in_menu: true,
      price: 1100,
    },
    {
      name: "Agua Mineral 500ml",
      description: "Agua sin gas",
      is_suggestable: false, // Not suggestable by rules, but show_in_menu = false makes it complementary
      show_in_menu: false, // Will appear as "Producto complementario"
      price: 800,
    },
    {
      name: "Jugo de Naranja",
      description: "Jugo natural",
      is_suggestable: true,
      show_in_menu: true,
      price: 1500,
    },
  ];

  for (const productData of products) {
    // Insert product
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        branch_id: branchId,
        category_id: categoryId,
        name: productData.name,
        description: productData.description,
        is_active: true,
        is_suggestable: productData.is_suggestable,
        show_in_menu: productData.show_in_menu,
        allow_half: false,
      })
      .select("id")
      .single();

    if (productError) {
      console.error(
        `Error creating product ${productData.name}:`,
        productError.message,
      );
      continue;
    }

    console.log(`Created product: ${productData.name} (ID: ${product.id})`);

    // Insert variant
    const { error: variantError } = await supabase
      .from("product_variants")
      .insert({
        product_id: product.id,
        name: "Única",
        price: productData.price,
        is_default: true,
      });

    if (variantError) {
      console.error(
        `Error creating variant for ${productData.name}:`,
        variantError.message,
      );
    } else {
      console.log(`  Added variant: $${productData.price}`);
    }
  }

  console.log("Done!");
}

createBeverageProducts().catch(console.error);
