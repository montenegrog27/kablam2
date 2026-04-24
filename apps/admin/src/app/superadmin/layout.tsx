"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUPERADMIN_EMAIL =
  process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function checkSuperAdmin() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      // Verificar si el email del usuario coincide con el superadmin
      if (user.email === SUPERADMIN_EMAIL) {
        setIsSuperAdmin(true);
      } else {
        // Si no es superadmin, redirigir al dashboard
        router.push("/dashboard");
        return;
      }

      setLoading(false);
    }

    checkSuperAdmin();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">
          Verificando permisos de superadministrador...
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null; // Redirección ya manejada
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-8">Kablam SuperAdmin</h1>

        <nav className="flex flex-col gap-2">
          <div className="text-xs text-gray-400 uppercase mb-2">Dashboard</div>
          <Link
            href="/superadmin"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Overview
          </Link>

          <div className="text-xs text-gray-400 uppercase mt-4 mb-2">
            Gestión
          </div>
          <Link
            href="/superadmin/tenants"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Tenants
          </Link>
          <Link
            href="/superadmin/branches"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Branches
          </Link>
          <Link
            href="/superadmin/users"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Users
          </Link>

          <div className="text-xs text-gray-400 uppercase mt-4 mb-2">
            Configuración
          </div>
          <Link
            href="/superadmin/settings"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            System Settings
          </Link>

          <div className="mt-auto pt-6 border-t border-gray-800">
            <button
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-800"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/login");
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
