"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadUser() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: userRecord } = await supabase
        .from("users")
        .select("*, tenants(*)")
        .eq("id", user.id)
        .single();

      if (!userRecord) {
        router.push("/dashboard");
        return;
      }

      setTenant(userRecord.tenants);
      setLoading(false);
    }

    loadUser();
  }, []);

  if (loading) return <div className="p-10">Cargando...</div>;

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-black text-white flex flex-col p-6">
        <h2 className="text-xl font-bold mb-6">{tenant?.name || "Kablam"}</h2>

        <nav className="flex flex-col gap-3">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/branches">Sucursales</Link>
          <Link href="/categories">Categorías</Link>
          <Link href="/products">Productos</Link>
          <Link href="/variant-types">Tipos de Variante</Link>
          <Link href="/ingredients">Ingredientes</Link>
          <Link href="/users">Usuarios</Link>
          <Link href="/day-parts">Turnos</Link>
          <Link href="/printers">Impresoras</Link>
          <Link href="/kitchens">Cocinas</Link>
          <Link href="/coupons">Cupones</Link>
          <Link href="/delivery-settings">Configuracion delivery</Link>
          <Link href="/settings">Configuración</Link>
        </nav>

        <button
          className="mt-auto bg-red-500 px-3 py-2 rounded"
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/login");
          }}
        >
          Cerrar sesión
        </button>
      </aside>

      <main className="flex-1 bg-gray-900 p-10">{children}</main>
    </div>
  );
}
