const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "apps/customer/.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getRuleId() {
  const { data: rules } = await supabase
    .from("upsell_rules")
    .select("id, category_id, suggested_category_id, discount, is_active")
    .eq("tenant_id", "3e3b5ec7-376e-4f5d-9735-c437a8849e95")
    .limit(1);

  console.log("Rule:", rules?.[0]);
}

getRuleId().catch(console.error);
