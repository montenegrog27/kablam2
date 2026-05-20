import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { createCustomerSession } from "@/lib/customer-session";

const JWT_SECRET =
  process.env.JWT_SECRET || "kablam-secret-change-in-production";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type MagicLinkPayload = {
  customerId: string;
  phone: string;
  branchId: string;
  tenantId: string;
  branchSlug?: string;
  returnTo?: string;
  type: string;
};

function getSafeReturnTo(value: unknown, branchSlug: string) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return `/${branchSlug}/account/profile`;
  }

  if (value.startsWith("//") || !value.startsWith(`/${branchSlug}/`)) {
    return `/${branchSlug}/account/profile`;
  }

  return value;
}

export async function GET(req: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(
        new URL("/auth/login?error=missing_token", req.url),
      );
    }

    let payload: MagicLinkPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as MagicLinkPayload;
    } catch {
      return NextResponse.redirect(
        new URL("/auth/login?error=invalid_token", req.url),
      );
    }

    if (payload.type !== "magic_link") {
      return NextResponse.redirect(
        new URL("/auth/login?error=invalid_token", req.url),
      );
    }

    let branchSlug = payload.branchSlug;

    if (!branchSlug) {
      const { data: branch } = await supabase
        .from("branches")
        .select("slug")
        .eq("id", payload.branchId)
        .single();

      branchSlug = branch?.slug;
    }

    if (!branchSlug) {
      return NextResponse.redirect(new URL("/?error=branch_not_found", req.url));
    }

    const returnTo = getSafeReturnTo(payload.returnTo, branchSlug);

    await createCustomerSession({
      customerId: payload.customerId,
      branchId: payload.branchId,
      tenantId: payload.tenantId,
      phone: payload.phone,
    });

    const sessionToken = jwt.sign(
      {
        customerId: payload.customerId,
        phone: payload.phone,
        branchId: payload.branchId,
        tenantId: payload.tenantId,
        createdAt: Date.now(),
      },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    await supabase
      .from("auth_sessions")
      .insert({
        customer_id: payload.customerId,
        token: sessionToken.slice(0, 20) + "...",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .maybeSingle();

    const completeUrl = new URL(`/${branchSlug}/auth/complete`, req.url);
    completeUrl.searchParams.set("returnTo", returnTo);

    const response = NextResponse.redirect(completeUrl);
    response.cookies.set("kablam_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return response;
  } catch (err: unknown) {
    console.error("Error en callback:", err);
    return NextResponse.redirect(
      new URL("/auth/login?error=server_error", req.url),
    );
  }
}
