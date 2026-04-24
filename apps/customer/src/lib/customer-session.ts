import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// Clave secreta para firmar cookies (debería ser una variable de entorno)
// En producción, usa una clave segura y guárdala en .env.local
// const SESSION_SECRET = process.env.SESSION_SECRET || "customer-session-secret-change-me";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 días en segundos

export type CustomerSession = {
  customerId: string;
  branchId: string;
  tenantId: string;
  phone: string;
  name?: string;
  expiresAt: number; // timestamp en segundos
};

/**
 * Crea una sesión para el cliente y la guarda en una cookie firmada
 */
export async function createCustomerSession(
  sessionData: Omit<CustomerSession, "expiresAt">,
) {
  const cookieStore = await cookies();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;

  const session: CustomerSession = {
    ...sessionData,
    expiresAt,
  };

  // En un sistema real, deberías firmar y encriptar la sesión
  // Por simplicidad, usamos JSON base64 (NO seguro para producción)
  // En producción, usa una librería como `iron-session` o `next-auth`
  const sessionValue = Buffer.from(JSON.stringify(session)).toString("base64");

  cookieStore.set("customer_session", sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  // También guardamos una versión simplificada en Supabase para validación cruzada
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await supabase.from("customer_sessions").upsert({
    customer_id: sessionData.customerId,
    branch_id: sessionData.branchId,
    session_token: sessionValue, // En producción usar un token único
    expires_at: new Date(expiresAt * 1000).toISOString(),
  });

  return session;
}

/**
 * Obtiene la sesión actual del cliente desde la cookie
 */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("customer_session");

    if (!sessionCookie?.value) {
      return null;
    }

    // Decodificar la sesión
    const sessionJson = Buffer.from(sessionCookie.value, "base64").toString();
    const session = JSON.parse(sessionJson) as CustomerSession;

    // Verificar expiración
    if (session.expiresAt < Math.floor(Date.now() / 1000)) {
      await destroyCustomerSession();
      return null;
    }

    // Validar sesión en Supabase (opcional, para seguridad adicional)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data } = await supabase
      .from("customer_sessions")
      .select("*")
      .eq("customer_id", session.customerId)
      .eq("branch_id", session.branchId)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!data) {
      await destroyCustomerSession();
      return null;
    }

    return session;
  } catch (error) {
    console.error("Error getting customer session:", error);
    return null;
  }
}

/**
 * Destruye la sesión actual del cliente
 */
export async function destroyCustomerSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("customer_session");

  if (sessionCookie?.value) {
    // Invalidar sesión en Supabase
    try {
      const sessionJson = Buffer.from(sessionCookie.value, "base64").toString();
      const session = JSON.parse(sessionJson) as CustomerSession;

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      await supabase
        .from("customer_sessions")
        .delete()
        .eq("customer_id", session.customerId)
        .eq("branch_id", session.branchId);
    } catch (error) {
      console.error("Error invalidating session in Supabase:", error);
    }
  }

  cookieStore.delete("customer_session");
}

/**
 * Verifica si el cliente está autenticado
 */
export async function isCustomerAuthenticated(): Promise<boolean> {
  const session = await getCustomerSession();
  return !!session;
}

/**
 * Obtiene el ID del cliente actual
 */
export async function getCurrentCustomerId(): Promise<string | null> {
  const session = await getCustomerSession();
  return session?.customerId || null;
}

/**
 * Middleware helper para proteger páginas
 * (para usar en server components o route handlers)
 */
export async function requireCustomerSession(branchSlug?: string) {
  const session = await getCustomerSession();

  if (!session) {
    throw new Error("No autenticado");
  }

  if (branchSlug) {
    // Verificar que la sesión corresponda a la sucursal actual
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("slug", branchSlug)
      .single();

    if (branch?.id !== session.branchId) {
      throw new Error("Sesión no válida para esta sucursal");
    }
  }

  return session;
}

/**
 * Helper para API routes - verifica sesión y devuelve error JSON si falla
 */
export async function verifyApiSession(
  branchSlug?: string,
): Promise<{ session: CustomerSession } | { error: Response }> {
  try {
    const session = await requireCustomerSession(branchSlug);
    return { session };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return {
      error: new Response(
        JSON.stringify({ error: "No autenticado", message }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
}
