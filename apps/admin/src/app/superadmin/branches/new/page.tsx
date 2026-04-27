"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Tenant = {
  id: string;
  name: string;
  slug: string;
};

export default function NewBranchPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadTenants() {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug")
        .order("name");

      if (error) {
        console.error("Error loading tenants:", error);
      } else {
        setTenants(data || []);
        if (data && data.length > 0) {
          setTenantId(data[0].id);
        }
      }
      setLoadingTenants(false);
    }

    loadTenants();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Obtener token de sesión
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        alert("No hay sesión activa. Por favor, inicia sesión nuevamente.");
        setLoading(false);
        return;
      }

      // Llamar a la API de SuperAdmin
      const response = await fetch("/api/superadmin/branches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          name,
          slug,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || "Error desconocido");
      }

      alert(`Branch "${name}" creada exitosamente.`);
      router.push("/superadmin/branches");
    } catch (error: any) {
      console.error("Error creando branch:", error);
      alert("Error al crear branch: " + error.message);
      setLoading(false);
    }
  };

  if (loadingTenants) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Link
            href="/superadmin/branches"
            className="text-gray-600 hover:underline"
          >
            ← Volver a Branches
          </Link>
        </div>
        <h1 className="text-2xl text-black font-bold mb-6">Crear nueva Branch</h1>
        <div className="text-lg">Cargando tenants...</div>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Link
            href="/superadmin/branches"
            className="text-gray-600 hover:underline"
          >
            ← Volver a Branches
          </Link>
        </div>
        <h1 className="text-2xl text-black font-bold mb-6">Crear nueva Branch</h1>
        <div className="bg-white border rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">
            No hay tenants registrados. Primero debes crear un tenant.
          </p>
          <Link
            href="/superadmin/tenants/new"
            className="inline-block bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
          >
            Crear Tenant
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/superadmin/branches"
          className="text-gray-600 hover:underline"
        >
          ← Volver a Branches
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-black mb-6">Crear nueva Branch</h1>

      <div className="max-w-2xl bg-gray-700 border rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Tenant *</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full border rounded-lg p-3"
              required
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Nombre de la branch *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="Ej: Sucursal Centro"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Slug único *
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
              className="w-full border rounded-lg p-3"
              placeholder="Ej: centro"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Se usará en las URLs del cliente (ej: https://app.kablam.com/
              {tenants.find((t) => t.id === tenantId)?.slug}/{slug})
            </p>
          </div>

          <div className="pt-4 border-t flex justify-end gap-4">
            <Link
              href="/superadmin/branches"
              className="px-5 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Creando..." : "Crear Branch"}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 text-sm text-gray-600">
        <p className="font-medium mb-2">Notas:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>La branch será creada inmediatamente y aparecerá en la lista.</li>
          <li>El slug debe ser único dentro del mismo tenant.</li>
        </ul>
      </div>
    </div>
  );
}
