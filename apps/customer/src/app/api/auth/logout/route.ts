import { NextResponse } from "next/server";
import { destroyCustomerSession } from "@/lib/customer-session";

export async function POST() {
  await destroyCustomerSession();

  const response = NextResponse.json({ success: true });

  response.cookies.set("kablam_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  response.cookies.set("customer_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
