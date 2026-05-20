import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/customer-session";

export async function GET() {
  const session = await getCustomerSession();

  return NextResponse.json({
    authenticated: !!session,
    session,
  });
}
