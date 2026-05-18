import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "kablam-secret-change-in-production";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/auth/login?error=missing_token", req.url));
    }

    // Verificar token
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.redirect(new URL("/auth/login?error=invalid_token", req.url));
    }

    if (payload.type !== "magic_link") {
      return NextResponse.redirect(new URL("/auth/login?error=invalid_token", req.url));
    }

    // Crear sesión (24h)
    const sessionToken = jwt.sign(
      {
        customerId: payload.customerId,
        phone: payload.phone,
        branchId: payload.branchId,
        tenantId: payload.tenantId,
        createdAt: Date.now(),
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Registrar sesión en BD para tracking
    await supabase.from("auth_sessions").insert({
      customer_id: payload.customerId,
      token: sessionToken.slice(0, 20) + "...",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).maybeSingle();

    // Redirigir al perfil con la cookie
    const response = NextResponse.redirect(new URL("/profile", req.url));
    response.cookies.set("kablam_session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 horas
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("Error en callback:", err);
    return NextResponse.redirect(new URL("/auth/login?error=server_error", req.url));
  }
}
