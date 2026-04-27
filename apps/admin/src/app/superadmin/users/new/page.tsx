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

type Branch = {
  id: string;
  name: string;
  slug: string;
  tenant_id: string;
};

export default function NewUserPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("cashier");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const router = useRouter();

  // Cargar tenants
  useEffect(() => {
    async function loadData() {
      const { data: tenantsData, error: tenantsError } = await supabase
        .from("tenants")
        .select("id, name, slug")
        .order("name");

      if (tenantsError) {
        console.error("Error loading tenants:", tenantsError);
      } else {
        setTenants(tenantsData || []);
        if (tenantsData && tenantsData.length > 0) {
          setSelectedTenantId(tenantsData[0].id);
        }
      }
      setLoadingData(false);
    }

    loadData();
  }, []);

  // Cargar branches cuando se selecciona un tenant
  useEffect(() => {
    async function loadBranches() {
      if (!selectedTenantId) {
        setBranches([]);
        return;
      }

      const { data: branchesData, error: branchesError } = await supabase
        .from("branches")
        .select("id, name, slug, tenant_id")
        .eq("tenant_id", selectedTenantId)
        .order("name");

      if (branchesError) {
        console.error("Error loading branches:", branchesError);
      } else {
        setBranches(branchesData || []);
        if (branchesData && branchesData.length > 0) {
          setSelectedBranchId(branchesData[0].id);
        } else {
          setSelectedBranchId("");
        }
      }
    }

    if (selectedTenantId) {
      loadBranches();
    }
  }, [selectedTenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!selectedTenantId) {
      alert("Por favor selecciona un tenant");
      setLoading(false);
      return;
    }

    // branch_id puede ser string vacía (null) para acceso a nivel tenant

    try {
      // Obtener token de sesión
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        alert("No hay sesión activa. Por favor, inicia sesión nuevamente.");
        setLoading(false);
        return;
      }

      // Llamar a la API de SuperAdmin para crear usuario
      const response = await fetch("/api/superadmin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: selectedTenantId,
          branch_id: selectedBranchId,
          email,
          name: name || email.split("@")[0],
          role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || "Error desconocido");
      }

      alert(`Usuario "${email}" creado exitosamente.`);
      router.push("/superadmin/users");
    } catch (error: any) {
      console.error("Error creando usuario:", error);
      alert("Error al crear usuario: " + error.message);
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Link
            href="/superadmin/users"
            className="text-gray-600 hover:underline"
          >
            ← Volver a Usuarios
          </Link>
        </div>
        <h1 className="text-2xl font-bold mb-6">Crear nuevo Usuario</h1>
        <div className="text-lg">Cargando datos...</div>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Link
            href="/superadmin/users"
            className="text-gray-600 hover:underline"
          >
            ← Volver a Usuarios
          </Link>
        </div>
        <h1 className="text-2xl font-bold mb-6">Crear nuevo Usuario</h1>
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
          href="/superadmin/users"
          className="text-gray-600 hover:underline"
        >
          ← Volver a Usuarios
        </Link>
      </div>

      <h1 className="text-2xl text-black font-bold mb-6">Crear nuevo Usuario</h1>

      <div className="max-w-2xl bg-gray-700 border rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Email del usuario *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="usuario@ejemplo.com"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              El usuario DEBE existir previamente en Supabase Auth.
              <br />
              Para crear un usuario en Supabase Auth, ve al dashboard de
              Supabase → Authentication → Users → Add User.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Nombre del usuario
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="Nombre del usuario (opcional)"
            />
            <p className="text-sm text-gray-500 mt-1">
              Si no se especifica, se usará la parte antes del @ del email.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Rol *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full border rounded-lg p-3"
                required
              >
                <option value="owner">Owner (Dueño)</option>
                <option value="admin">Admin (Administrador)</option>
                <option value="cashier">Cashier (Cajero)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Tenant *</label>
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Branch (Sucursal)
            </label>
            {branches.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-700 text-sm">
                  No hay branches para este tenant. El usuario tendrá acceso a
                  nivel tenant.
                </p>
                <input type="hidden" value="" />
              </div>
            ) : (
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full border rounded-lg p-3"
              >
                <option value="">
                  Sin branch específica (acceso a nivel tenant)
                </option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.slug})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="pt-4 border-t flex justify-end gap-4">
            <Link
              href="/superadmin/users"
              className="px-5 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creando..." : "Crear Usuario"}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 text-sm text-gray-600">
        <p className="font-medium mb-2">Notas importantes:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            El usuario DEBE existir previamente en Supabase Auth con el mismo
            email.
          </li>
          <li>
            Si el usuario no existe en Supabase Auth, créalo primero en el
            dashboard de Supabase.
          </li>
          <li>
            El usuario podrá iniciar sesión en la app Admin con su email y
            contraseña.
          </li>
          <li>
            Los permisos dependen del rol asignado (owner, admin, cashier).
          </li>
          <li>El usuario quedará asociado al tenant y branch seleccionados.</li>
        </ul>
      </div>
    </div>
  );
}
