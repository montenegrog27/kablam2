const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "apps/customer/.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUpdate() {
  const ruleId = "530b4e5d-21d7-4782-8893-82e5dcc41bb4";

  // Try to update discount
  const { error } = await supabase
    .from("upsell_rules")
    .update({ discount: 999 })
    .eq("id", ruleId);

  if (error) {
    console.log("Update blocked:", error.message);
  } else {
    console.log("WARNING: Update succeeded! Public can update rules.");
  }
}

testUpdate().catch(console.error);
