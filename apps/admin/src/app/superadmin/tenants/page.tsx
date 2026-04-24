"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import Link from "next/link";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string;
  created_at: string;
};

export default function TenantsPage() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    async function loadTenants() {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, plan, trial_ends_at, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading tenants:", error);
      } else {
        setTenants(data || []);
      }
      setLoading(false);
    }

    loadTenants();
  }, []);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "¿Estás seguro de eliminar este tenant? Esta acción no se puede deshacer.",
      )
    ) {
      return;
    }

    const { error } = await supabase.from("tenants").delete().eq("id", id);

    if (error) {
      alert("Error al eliminar tenant: " + error.message);
    } else {
      setTenants(tenants.filter((t) => t.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Tenants</h1>
        <div className="text-lg">Cargando tenants...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Tenants</h1>
        <Link
          href="/superadmin/tenants/new"
          className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
        >
          + Crear Tenant
        </Link>
      </div>

      <p className="text-gray-600 mb-6">
        Los tenants representan restaurantes independientes que pueden tener
        múltiples branches.
      </p>

      {tenants.length === 0 ? (
        <div className="bg-white border rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">No hay tenants registrados.</p>
          <Link
            href="/superadmin/tenants/new"
            className="inline-block bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
          >
            Crear primer tenant
          </Link>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4">Nombre</th>
                <th className="text-left p-4">Slug</th>
                <th className="text-left p-4">Plan</th>
                <th className="text-left p-4">Trial termina</th>
                <th className="text-left p-4">Creado</th>
                <th className="text-left p-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-medium">{tenant.name}</td>
                  <td className="p-4">
                    <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                      {tenant.slug}
                    </code>
                  </td>
                  <td className="p-4">
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                      {tenant.plan || "free"}
                    </span>
                  </td>
                  <td className="p-4">
                    {new Date(tenant.trial_ends_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Link
                        href={`/superadmin/tenants/${tenant.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => handleDelete(tenant.id)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Eliminar
                      </button>
                      <Link
                        href={`/superadmin/branches?tenant=${tenant.id}`}
                        className="text-gray-600 hover:underline text-sm"
                      >
                        Branches
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
