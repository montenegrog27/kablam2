"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type AuthSession = {
  customerId: string;
  phone: string;
  name?: string;
  branchId: string;
  tenantId: string;
  expiresAt?: number;
};

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setSession(data.session || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);

    const branchSlug = pathname.split("/").filter(Boolean)[0];
    router.push(branchSlug ? `/${branchSlug}/auth/login` : "/");
  };

  return { session, loading, logout, isAuthenticated: !!session };
}
