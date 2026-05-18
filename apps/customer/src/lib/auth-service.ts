import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "kablam-secret-change-in-production";
const TOKEN_EXPIRY = "5m"; // el token del magic link expira en 5 minutos
const SESSION_EXPIRY = "24h"; // la sesión dura 24 horas

export type AuthSession = {
  customerId: string;
  phone: string;
  name?: string;
  branchId: string;
  tenantId: string;
  createdAt: number;
};

export function generateMagicToken(phone: string, customerId: string, branchId: string, tenantId: string): string {
  return jwt.sign(
    { phone, customerId, branchId, tenantId, type: "magic_link" },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function generateSessionToken(session: AuthSession): string {
  return jwt.sign(session, JWT_SECRET, { expiresIn: SESSION_EXPIRY });
}

export function verifyMagicToken(token: string): { phone: string; customerId: string; branchId: string; tenantId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== "magic_link") return null;
    return {
      phone: decoded.phone,
      customerId: decoded.customerId,
      branchId: decoded.branchId,
      tenantId: decoded.tenantId,
    };
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string): AuthSession | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthSession;
  } catch {
    return null;
  }
}

export function getSessionFromCookies(): AuthSession | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split("; ").reduce((acc, c) => {
    const [key, val] = c.split("=");
    acc[key] = val;
    return acc;
  }, {} as Record<string, string>);

  const sessionToken = cookies["kablam_session"];
  if (!sessionToken) return null;
  return verifySessionToken(sessionToken);
}
