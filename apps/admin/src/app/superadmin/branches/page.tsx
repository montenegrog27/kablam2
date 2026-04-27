"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import Link from "next/link";

type Branch = {
  id: string;
  name: string;
  slug: string;
  tenant_id: string;
  tenants: Array<{ name: string; slug: string }>;
  created_at: string;
};

export default function BranchesPage() {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    async function loadBranches() {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, slug, tenant_id, created_at, tenants(name, slug)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading branches:", error);
      } else {
        setBranches(data || []);
      }
      setLoading(false);
    }

    loadBranches();
  }, []);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "¿Estás seguro de eliminar esta branch? Esta acción no se puede deshacer.",
      )
    ) {
      return;
    }

    const { error } = await supabase.from("branches").delete().eq("id", id);

    if (error) {
      alert("Error al eliminar branch: " + error.message);
    } else {
      setBranches(branches.filter((b) => b.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Branches</h1>
        <div className="text-lg">Cargando branches...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl text-black font-bold">Branches</h1>
        <Link
          href="/superadmin/branches/new"
          className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
        >
          + Crear Branch
        </Link>
      </div>

      <p className="text-gray-600 mb-6">
        Las branches son sucursales físicas de cada tenant (restaurante).
      </p>

      {branches.length === 0 ? (
        <div className="bg-gray-700 border rounded-lg p-8 text-center">
          <p className="text-gray-700 mb-4">No hay branches registradas.</p>
          <Link
            href="/superadmin/branches/new"
            className="inline-block bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
          >
            Crear primera branch
          </Link>
        </div>
      ) : (
        <div className="bg-gray-900 border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700 border-b">
              <tr>
                <th className="text-left p-4">Nombre</th>
                <th className="text-left p-4">Slug</th>
                <th className="text-left p-4">Tenant</th>
                <th className="text-left p-4">Creado</th>
                <th className="text-left p-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-medium">{branch.name}</td>
                  <td className="p-4">
                    <code className="bg-gray-700 px-2 py-1 rounded text-sm">
                      {branch.slug}
                    </code>
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/superadmin/tenants`}
                      className="text-blue-600 hover:underline"
                    >
                      {branch.tenants?.[0]?.name || branch.tenant_id}
                    </Link>
                  </td>
                  <td className="p-4">
                    {new Date(branch.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Link
                        href={`/superadmin/branches/${branch.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => handleDelete(branch.id)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Eliminar
                      </button>
                      <Link
                        href={`/superadmin/branches/${branch.id}/settings`}
                        className="text-gray-600 hover:underline text-sm"
                      >
                        Config
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
