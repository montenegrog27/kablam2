import { NextResponse } from "next/server";
import { destroyCustomerSession } from "@/lib/customer-session";

export async function POST() {
  try {
    await destroyCustomerSession();

    return NextResponse.json({
      success: true,
      message: "Sesión cerrada correctamente",
    });
  } catch (error: unknown) {
    console.error("Error en logout:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

// También soportar GET para redirección
export async function GET() {
  try {
    await destroyCustomerSession();

    // Redirigir a la página principal
    return NextResponse.redirect(
      new URL("/", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"),
    );
  } catch (error: unknown) {
    console.error("Error en logout GET:", error);
    // Si hay error, igual redirigir
    return NextResponse.redirect(
      new URL("/", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"),
    );
  }
}
