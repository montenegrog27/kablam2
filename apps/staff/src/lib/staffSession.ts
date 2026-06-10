import crypto from "crypto";
import { cookies } from "next/headers";

export const STAFF_COOKIE = "kablam_staff_session";

export type StaffSession = {
  employeeId: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  name: string;
  email: string;
  role: string;
  roleId?: string | null;
  exp: number;
};

function secret() {
  const value = process.env.STAFF_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Missing STAFF_SESSION_SECRET");
  return value;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(data: string) {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createStaffToken(session: Omit<StaffSession, "exp">) {
  const payload: StaffSession = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyStaffToken(token?: string | null): StaffSession | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  if (signature.length !== expected.length) return null;
  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StaffSession;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getStaffSession() {
  const cookieStore = await cookies();
  return verifyStaffToken(cookieStore.get(STAFF_COOKIE)?.value);
}
