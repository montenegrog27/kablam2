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

type MembershipForm = {
  tenant_id: string;
  branch_id: string;
  role: string;
  is_active: boolean;
};

const roles = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "cashier", label: "Cashier" },
];

export default function EditUserPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<UserRow | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState("");
  const [memberships, setMemberships] = useState<MembershipForm[]>([]);
  const [setupMissing, setSetupMissing] = useState(false);

  const tenantById = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant])),
    [tenants],
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
    const nextTenants = (tenantRows || []) as Tenant[];
    setUser(nextUser);
    setTenants(nextTenants);
    setBranches((branchRows || []) as Branch[]);
    setName(nextUser.name || "");

    const fallbackMembership = {
      tenant_id: nextUser.tenant_id || nextTenants[0]?.id || "",
      branch_id: nextUser.branch_id || "",
      role: nextUser.role || "cashier",
      is_active: true,
    };

    const { data: membershipRows, error: membershipError } = await supabase
      .from("user_tenant_memberships")
      .select("tenant_id, branch_id, role, is_active")
      .eq("user_id", params.userId)
      .order("created_at", { ascending: true });

    if (membershipError) {
      console.warn("Multi-tenant memberships not available:", membershipError.message);
      setSetupMissing(true);
      setMemberships([fallbackMembership]);
    } else if (membershipRows && membershipRows.length > 0) {
      setSetupMissing(false);
      setMemberships(
        membershipRows.map((row: any, index: number) => ({
          tenant_id: row.tenant_id || "",
          branch_id: row.branch_id || "",
          role: row.role || "cashier",
          is_active: Boolean(row.is_active) || index === 0,
        })),
      );
    } else {
      setSetupMissing(false);
      setMemberships([fallbackMembership]);
    }

    setLoading(false);
  }

  function updateMembership(index: number, patch: Partial<MembershipForm>) {
    setMemberships((current) =>
      current.map((membership, itemIndex) => {
        if (itemIndex !== index) return membership;

        const tenantChanged = patch.tenant_id && patch.tenant_id !== membership.tenant_id;
        return {
          ...membership,
          ...patch,
          ...(tenantChanged ? { branch_id: "" } : {}),
        };
      }),
    );
  }

  function setActiveMembership(index: number) {
    setMemberships((current) =>
      current.map((membership, itemIndex) => ({
        ...membership,
        is_active: itemIndex === index,
      })),
    );
  }

  function addMembership() {
    const usedTenantIds = new Set(memberships.map((membership) => membership.tenant_id));
    const availableTenant = tenants.find((tenant) => !usedTenantIds.has(tenant.id));

    if (!availableTenant) {
      alert("Este usuario ya tiene acceso a todos los tenants disponibles.");
      return;
    }

    setMemberships((current) => [
      ...current,
      {
        tenant_id: availableTenant.id,
        branch_id: "",
        role: "admin",
        is_active: current.length === 0,
      },
    ]);
  }

  function removeMembership(index: number) {
    setMemberships((current) => {
      if (current.length === 1) {
        alert("El usuario debe tener al menos un tenant.");
        return current;
      }

      const next = current.filter((_, itemIndex) => itemIndex !== index);
      if (!next.some((membership) => membership.is_active)) {
        next[0] = { ...next[0], is_active: true };
      }
      return next;
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const activeMembership = memberships.find((membership) => membership.is_active) || memberships[0];
    const tenantIds = memberships.map((membership) => membership.tenant_id);

    if (new Set(tenantIds).size !== tenantIds.length) {
      alert("No puede haber dos accesos al mismo tenant.");
      setSaving(false);
      return;
    }

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
          name,
          role: activeMembership.role,
          tenant_id: activeMembership.tenant_id,
          branch_id: activeMembership.branch_id,
          tenant_memberships: memberships,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.details || result.error || "No se pudo guardar");
      }

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
          Volver a Usuarios
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
          Volver a Usuarios
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
          Volver a Usuarios
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-black">Editar usuario</h1>
        <p className="mt-2 text-gray-600">
          Asigna uno o mas tenants al usuario y marca cual queda activo para operar.
        </p>
      </div>

      {setupMissing && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Falta ejecutar <strong>add_user_tenant_memberships.sql</strong> en Supabase para guardar multiples tenants.
        </div>
      )}

      <form onSubmit={save} className="max-w-5xl space-y-6">
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-lg font-bold text-black">Datos base</h2>

          <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.3fr]">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Nombre *</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border p-3 text-gray-950"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">ID</label>
              <code className="block rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
                {user.id}
              </code>
            </div>
          </div>

          <div className="mt-5 rounded-lg border bg-gray-50 p-4 text-sm text-gray-700">
            <p>
              Creado: {user.created_at ? new Date(user.created_at).toLocaleString("es-AR") : "sin fecha"}
            </p>
            <p className="mt-1">
              Tenant activo actual: {user.tenants?.name || "sin tenant"} - {user.branches?.name || "sin sucursal"}
            </p>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-black">Accesos por tenant</h2>
              <p className="mt-1 text-sm text-gray-600">
                Para tu usuario developer, agregale todos los tenants con rol Owner.
                El activo es el que usa el admin/cashier actualmente.
              </p>
            </div>
            <button
              type="button"
              onClick={addMembership}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              + Agregar tenant
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {memberships.map((membership, index) => {
              const filteredBranches = branches.filter(
                (branch) => branch.tenant_id === membership.tenant_id,
              );
              const tenant = tenantById.get(membership.tenant_id);

              return (
                <div key={`${membership.tenant_id}-${index}`} className="rounded-xl border border-gray-200 p-4">
                  <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wide text-gray-900">
                        {tenant ? `${tenant.name} (${tenant.slug})` : "Tenant"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {membership.is_active ? "Activo para operar ahora" : "Acceso disponible"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="radio"
                          checked={membership.is_active}
                          onChange={() => setActiveMembership(index)}
                        />
                        Activo
                      </label>
                      <button
                        type="button"
                        onClick={() => removeMembership(index)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Tenant</label>
                      <select
                        value={membership.tenant_id}
                        onChange={(event) => updateMembership(index, { tenant_id: event.target.value })}
                        className="w-full rounded-lg border p-3 text-gray-950"
                        required
                      >
                        {tenants.map((tenantOption) => (
                          <option key={tenantOption.id} value={tenantOption.id}>
                            {tenantOption.name} ({tenantOption.slug})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Rol</label>
                      <select
                        value={membership.role}
                        onChange={(event) => updateMembership(index, { role: event.target.value })}
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
                      <label className="mb-2 block text-sm font-medium text-gray-700">Sucursal</label>
                      <select
                        value={membership.branch_id}
                        onChange={(event) => updateMembership(index, { branch_id: event.target.value })}
                        className="w-full rounded-lg border p-3 text-gray-950"
                      >
                        <option value="">Nivel tenant</option>
                        {filteredBranches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name} ({branch.slug})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex justify-end gap-4 border-t pt-4">
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
  );
}
