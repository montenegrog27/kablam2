"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

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

type UserRow = {
  id: string;
  name: string;
  role: string;
  tenant_id: string;
  branch_id: string | null;
  created_at: string;
  tenants?: { name?: string | null } | null;
  branches?: { name?: string | null } | null;
};

const roles = [
  { value: "owner", label: "Owner (Dueño)" },
  { value: "manager", label: "Manager (Gerente)" },
  { value: "admin", label: "Admin (Administrador)" },
  { value: "cashier", label: "Cashier (Cajero)" },
];

export default function EditUserPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<UserRow | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({
    name: "",
    role: "cashier",
    tenant_id: "",
    branch_id: "",
  });

  const filteredBranches = useMemo(
    () => branches.filter((branch) => branch.tenant_id === form.tenant_id),
    [branches, form.tenant_id],
  );

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: userRow, error: userError }, { data: tenantRows }, { data: branchRows }] =
      await Promise.all([
        supabase
          .from("users")
          .select("*, tenants(name), branches(name)")
          .eq("id", params.userId)
          .single(),
        supabase.from("tenants").select("id, name, slug").order("name"),
        supabase.from("branches").select("id, name, slug, tenant_id").order("name"),
      ]);

    if (userError || !userRow) {
      console.error(userError);
      setUser(null);
      setLoading(false);
      return;
    }

    const nextUser = userRow as UserRow;
    setUser(nextUser);
    setTenants((tenantRows || []) as Tenant[]);
    setBranches((branchRows || []) as Branch[]);
    setForm({
      name: nextUser.name || "",
      role: nextUser.role || "cashier",
      tenant_id: nextUser.tenant_id || "",
      branch_id: nextUser.branch_id || "",
    });
    setLoading(false);
  }

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "tenant_id" ? { branch_id: "" } : {}),
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("No hay sesion activa.");

      const response = await fetch("/api/superadmin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: params.userId,
          ...form,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.details || result.error || "No se pudo guardar");

      alert("Usuario actualizado.");
      router.push("/superadmin/users");
    } catch (error: any) {
      alert("Error al actualizar usuario: " + error.message);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <Link href="/superadmin/users" className="text-gray-600 hover:underline">
          ← Volver a Usuarios
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-black">Editar usuario</h1>
        <p className="mt-4 text-gray-600">Cargando datos...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8">
        <Link href="/superadmin/users" className="text-gray-600 hover:underline">
          ← Volver a Usuarios
        </Link>
        <div className="mt-6 rounded-lg border bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-black">Usuario no encontrado</h1>
          <p className="mt-2 text-gray-500">No existe un usuario con ese ID.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/superadmin/users" className="text-gray-600 hover:underline">
          ← Volver a Usuarios
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-black">Editar usuario</h1>
        <p className="mt-2 text-gray-600">
          Cambia el tenant, sucursal y rol operativo del usuario.
        </p>
      </div>

      <div className="max-w-2xl rounded-lg border bg-gray-700 p-6">
        <form onSubmit={save} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">ID</label>
            <code className="block rounded-lg border bg-gray-100 p-3 text-sm text-gray-700">
              {user.id}
            </code>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Nombre *</label>
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              className="w-full rounded-lg border p-3 text-gray-950"
              required
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Rol *</label>
              <select
                value={form.role}
                onChange={(event) => update("role", event.target.value)}
                className="w-full rounded-lg border p-3 text-gray-950"
                required
              >
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Tenant *</label>
              <select
                value={form.tenant_id}
                onChange={(event) => update("tenant_id", event.target.value)}
                className="w-full rounded-lg border p-3 text-gray-950"
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
            <label className="mb-2 block text-sm font-medium">Branch</label>
            <select
              value={form.branch_id}
              onChange={(event) => update("branch_id", event.target.value)}
              className="w-full rounded-lg border p-3 text-gray-950"
            >
              <option value="">Sin branch especifica (acceso a nivel tenant)</option>
              {filteredBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.slug})
                </option>
              ))}
            </select>
            {filteredBranches.length === 0 && (
              <p className="mt-2 text-sm text-yellow-200">
                Este tenant todavia no tiene sucursales.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 text-sm text-gray-300">
            <p>
              Creado: {user.created_at ? new Date(user.created_at).toLocaleString("es-AR") : "sin fecha"}
            </p>
            <p className="mt-1">
              Actual: {user.tenants?.name || "sin tenant"} · {user.branches?.name || "sin branch"}
            </p>
          </div>

          <div className="flex justify-end gap-4 border-t border-gray-600 pt-4">
            <Link href="/superadmin/users" className="rounded-lg border bg-white px-5 py-2 text-gray-900 hover:bg-gray-50">
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-5 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
