"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
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
      <aside className="w-64 bg-black text-white flex flex-col p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">{tenant?.name || "Kablam"}</h2>

        <nav className="flex flex-col gap-1">
          <Link
            href="/dashboard"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Dashboard
          </Link>

          <div className="mt-3 mb-1 px-3 text-xs text-gray-500 uppercase">
            Gestión
          </div>
          <Link
            href="/branches"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Sucursales
          </Link>
          <Link
            href="/categories"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Categorías
          </Link>
          <Link
            href="/products"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Productos
          </Link>
          <Link
            href="/variant-types"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Tipos de Variante
          </Link>

          <div className="mt-3 mb-1 px-3 text-xs text-gray-500 uppercase">
            Ingredientes
          </div>
          <Link
            href="/ingredients"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Ingredientes
          </Link>
          <Link
            href="/product-ingredients"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Ingredientes x Producto
          </Link>
          <Link href="/combos" className="px-3 py-2 rounded hover:bg-gray-800">
            Combos
          </Link>
          <Link
            href="/product-extras"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Extras x Producto
          </Link>
          <Link href="/upsells" className="px-3 py-2 rounded hover:bg-gray-800">
            Sugerencias Checkout
          </Link>

          <div className="mt-3 mb-1 px-3 text-xs text-gray-500 uppercase">
            Operaciones
          </div>
          <Link href="/coupons" className="px-3 py-2 rounded hover:bg-gray-800">
            Cupones
          </Link>
          <Link href="/riders" className="px-3 py-2 rounded hover:bg-gray-800">
            Repartidores
          </Link>
          <Link
            href="/day-parts"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Turnos
          </Link>
          <Link
            href="/kitchens"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Cocinas
          </Link>
          <Link
            href="/printers"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Impresoras
          </Link>

          <div className="mt-3 mb-1 px-3 text-xs text-gray-500 uppercase">
            Configuración
          </div>
          <Link
            href="/delivery-settings"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Delivery
          </Link>
          <Link
            href="/payment-methods"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Métodos de Pago
          </Link>
          <Link href="/users" className="px-3 py-2 rounded hover:bg-gray-800">
            Usuarios
          </Link>
          <Link
            href="/settings"
            className="px-3 py-2 rounded hover:bg-gray-800"
          >
            Configuración
          </Link>
        </nav>

        <button
          className="mt-6 bg-red-500 px-3 py-2 rounded hover:bg-red-600"
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/login");
          }}
        >
          Cerrar sesión
        </button>
      </aside>

      <main className="flex-1 bg-gray-900 p-10 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
