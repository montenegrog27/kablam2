"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.NEXT_PUBLIC_JWT_SECRET || "kablam-secret-change-in-production";

type AuthSession = {
  customerId: string;
  phone: string;
  name?: string;
  branchId: string;
  tenantId: string;
  createdAt: number;
};

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const cookies = document.cookie.split("; ").reduce((acc, c) => {
      const [k, v] = c.split("=");
      acc[k] = v;
      return acc;
    }, {} as Record<string, string>);

    const token = cookies["kablam_session"];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthSession;
        setSession(decoded);
      } catch {
        setSession(null);
      }
    }
    setLoading(false);
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    router.push("/auth/login");
  };

  return { session, loading, logout, isAuthenticated: !!session };
}
