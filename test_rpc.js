const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "apps/customer/.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function testRPC() {
  // Try to call a function that might exist
  const { data, error } = await supabase.rpc("get_policies", {
    table_name: "upsell_rules",
  });
  if (error) {
    console.log("RPC get_policies error:", error.message);
  } else {
    console.log("Policies:", data);
  }
}

testRPC().catch(console.error);
