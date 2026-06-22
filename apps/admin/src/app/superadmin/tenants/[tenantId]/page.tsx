"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type TenantForm = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string;
};

const emptyTenant: TenantForm = {
  id: "",
  name: "",
  slug: "",
  plan: "free",
  trial_ends_at: "",
};

function toDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function fromDateInput(value: string) {
  if (!value) return null;
  return new Date(`${value}T12:00:00`).toISOString();
}

export default function EditTenantPage() {
  const params = useParams<{ tenantId: string }>();
  const router = useRouter();
  const [form, setForm] = useState<TenantForm>(emptyTenant);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadTenant() {
      const tenantId = params?.tenantId;
      if (!tenantId) return;

      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, plan, trial_ends_at")
        .eq("id", tenantId)
        .single();

      if (error || !data) {
        console.error("Error loading tenant:", error);
        alert("No se pudo cargar el tenant");
        router.push("/superadmin/tenants");
        return;
      }

      setForm({
        id: data.id,
        name: data.name || "",
        slug: data.slug || "",
        plan: data.plan || "free",
        trial_ends_at: toDateInput(data.trial_ends_at),
      });
      setLoading(false);
    }

    loadTenant();
  }, [params?.tenantId, router]);

  const updateForm = (field: keyof TenantForm, value: string) => {
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

      const response = await fetch("/api/superadmin/tenants", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          trial_ends_at: fromDateInput(form.trial_ends_at),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || "Error desconocido");
      }

      alert("Tenant actualizado correctamente.");
      router.push("/superadmin/tenants");
    } catch (error: any) {
      console.error("Error editando tenant:", error);
      alert("Error al editar tenant: " + error.message);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <Link href="/superadmin/tenants" className="text-gray-600 hover:underline">
          Volver a Tenants
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-black">Editar Tenant</h1>
        <div className="mt-6 text-lg">Cargando tenant...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/superadmin/tenants" className="text-gray-600 hover:underline">
          Volver a Tenants
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-black">Editar Tenant</h1>

      <div className="max-w-2xl rounded-lg border bg-gray-700 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Nombre del restaurante *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              className="w-full rounded-lg border p-3 text-gray-950"
              placeholder="Ej: La Parrilla de Juan"
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
              placeholder="Ej: la-parrilla"
              required
            />
            <p className="mt-1 text-sm text-gray-300">
              Se usa para resolver URLs y dominios del tenant.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Plan</label>
              <select
                value={form.plan}
                onChange={(event) => updateForm("plan", event.target.value)}
                className="w-full rounded-lg border p-3 text-gray-950"
              >
                <option value="free">Free</option>
                <option value="premium">Premium</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Trial termina
              </label>
              <input
                type="date"
                value={form.trial_ends_at}
                onChange={(event) =>
                  updateForm("trial_ends_at", event.target.value)
                }
                className="w-full rounded-lg border p-3 text-gray-950"
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 border-t pt-4">
            <Link
              href="/superadmin/tenants"
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
