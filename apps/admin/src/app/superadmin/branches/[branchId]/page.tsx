"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Tenant = {
  id: string;
  name: string;
  slug: string;
};

type BranchForm = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  active: boolean;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  dine_in_enabled: boolean;
};

const emptyBranch: BranchForm = {
  id: "",
  tenant_id: "",
  name: "",
  slug: "",
  address: "",
  phone: "",
  active: true,
  delivery_enabled: true,
  pickup_enabled: true,
  dine_in_enabled: true,
};

export default function EditBranchPage() {
  const params = useParams<{ branchId: string }>();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [form, setForm] = useState<BranchForm>(emptyBranch);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      const branchId = params?.branchId;
      if (!branchId) return;

      const [{ data: tenantsData, error: tenantsError }, { data: branchData, error: branchError }] =
        await Promise.all([
          supabase.from("tenants").select("id, name, slug").order("name"),
          supabase.from("branches").select("*").eq("id", branchId).single(),
        ]);

      if (tenantsError) {
        console.error("Error loading tenants:", tenantsError);
      }

      if (branchError || !branchData) {
        console.error("Error loading branch:", branchError);
        alert("No se pudo cargar la branch");
        router.push("/superadmin/branches");
        return;
      }

      setTenants(tenantsData || []);
      setForm({
        id: branchData.id,
        tenant_id: branchData.tenant_id || "",
        name: branchData.name || "",
        slug: branchData.slug || "",
        address: branchData.address || "",
        phone: branchData.phone || "",
        active: branchData.active ?? true,
        delivery_enabled: branchData.delivery_enabled ?? true,
        pickup_enabled: branchData.pickup_enabled ?? true,
        dine_in_enabled: branchData.dine_in_enabled ?? true,
      });
      setLoading(false);
    }

    loadData();
  }, [params?.branchId, router]);

  const updateForm = (field: keyof BranchForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        alert("No hay sesion activa. Inicia sesion nuevamente.");
        setSaving(false);
        return;
      }

      const response = await fetch("/api/superadmin/branches", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || "Error desconocido");
      }

      alert("Branch actualizada correctamente.");
      router.push("/superadmin/branches");
    } catch (error: any) {
      console.error("Error editando branch:", error);
      alert("Error al editar branch: " + error.message);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <Link href="/superadmin/branches" className="text-gray-600 hover:underline">
          Volver a Branches
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-black">Editar Branch</h1>
        <div className="mt-6 text-lg">Cargando branch...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/superadmin/branches" className="text-gray-600 hover:underline">
          Volver a Branches
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-black">Editar Branch</h1>

      <div className="max-w-2xl rounded-lg border bg-gray-700 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">Tenant *</label>
            <select
              value={form.tenant_id}
              onChange={(event) => updateForm("tenant_id", event.target.value)}
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

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Nombre de la branch *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                className="w-full rounded-lg border p-3 text-gray-950"
                placeholder="Ej: Sucursal Centro"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Slug unico *</label>
              <input
                type="text"
                value={form.slug}
                onChange={(event) =>
                  updateForm(
                    "slug",
                    event.target.value.toLowerCase().replace(/\s+/g, "-"),
                  )
                }
                className="w-full rounded-lg border p-3 text-gray-950"
                placeholder="Ej: centro"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Direccion</label>
            <input
              type="text"
              value={form.address}
              onChange={(event) => updateForm("address", event.target.value)}
              className="w-full rounded-lg border p-3 text-gray-950"
              placeholder="Ej: San Juan 633"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Telefono</label>
            <input
              type="text"
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
              className="w-full rounded-lg border p-3 text-gray-950"
              placeholder="Ej: 5493794054555"
            />
            <p className="mt-1 text-sm text-gray-300">
              Este telefono tambien puede usarse como fallback para avisos de catalogo.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Toggle
              label="Branch activa"
              checked={form.active}
              onChange={(value) => updateForm("active", value)}
            />
            <Toggle
              label="Delivery habilitado"
              checked={form.delivery_enabled}
              onChange={(value) => updateForm("delivery_enabled", value)}
            />
            <Toggle
              label="Retiro habilitado"
              checked={form.pickup_enabled}
              onChange={(value) => updateForm("pickup_enabled", value)}
            />
            <Toggle
              label="Salon habilitado"
              checked={form.dine_in_enabled}
              onChange={(value) => updateForm("dine_in_enabled", value)}
            />
          </div>

          <div className="flex justify-end gap-4 border-t pt-4">
            <Link
              href="/superadmin/branches"
              className="rounded-lg border px-5 py-2 hover:bg-gray-50"
            >
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-gray-600 bg-gray-800 px-4 py-3">
      <span className="text-sm font-medium text-gray-100">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}
