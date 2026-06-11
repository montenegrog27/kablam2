import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCustomerSession } from "@/lib/customer-session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  const session = await getCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { rewardId } = await req.json();
  if (!rewardId || typeof rewardId !== "string") {
    return NextResponse.json({ error: "Recompensa inválida" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase.rpc("redeem_loyalty_reward", {
    p_customer_id: session.customerId,
    p_reward_id: rewardId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.ok) {
    const status = data?.error === "insufficient_points" ? 400 : 404;
    return NextResponse.json(data || { ok: false }, { status });
  }

  return NextResponse.json(data);
}
