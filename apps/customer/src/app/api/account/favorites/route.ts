import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCustomerSession } from "@/lib/customer-session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET /api/account/favorites
export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data } = await supabase
    .from("user_favorites")
    .select("*, products(name), product_variants(price)")
    .eq("customer_id", session.customerId)
    .order("created_at", { ascending: false });
  return NextResponse.json(data || []);
}

// POST /api/account/favorites
export async function POST(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { productId, variantId } = await req.json();
  if (!productId) return NextResponse.json({ error: "Falta productId" }, { status: 400 });
  const { error } = await supabase.from("user_favorites").insert({
    customer_id: session.customerId, product_id: productId, variant_id: variantId || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/account/favorites
export async function DELETE(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { productId } = await req.json();
  if (!productId) return NextResponse.json({ error: "Falta productId" }, { status: 400 });
  await supabase.from("user_favorites").delete()
    .eq("customer_id", session.customerId)
    .eq("product_id", productId);
  return NextResponse.json({ success: true });
}
