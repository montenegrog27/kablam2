const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "apps/customer/.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDelete() {
  const ruleId = "530b4e5d-21d7-4782-8893-82e5dcc41bb4";

  // Try to delete
  const { error } = await supabase
    .from("upsell_rules")
    .delete()
    .eq("id", ruleId);

  if (error) {
    console.log("Delete blocked:", error.message);
  } else {
    console.log("WARNING: Delete succeeded! Public can delete rules.");
  }
}

testDelete().catch(console.error);
