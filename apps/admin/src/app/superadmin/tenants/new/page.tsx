"use client";

import { useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewTenantPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("free");
  const [trialDays, setTrialDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + trialDays);

    const { data: tenant, error } = await supabase
      .from("tenants")
      .insert({
        name,
        slug,
        plan,
        trial_ends_at: trialEnds.toISOString(),
      })
      .select()
      .single();

    if (error) {
      alert("Error al crear tenant: " + error.message);
      setLoading(false);
      return;
    }

    alert(`Tenant "${name}" creado exitosamente.`);
    router.push("/superadmin/tenants");
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/superadmin/tenants"
          className="text-gray-600 hover:underline"
        >
          ← Volver a Tenants
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Crear nuevo Tenant</h1>

      <div className="max-w-2xl bg-white border rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Nombre del restaurante *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="Ej: La Parrilla de Juan"
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
              placeholder="Ej: la-parrilla"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Se usará en las URLs (ej: https://app.kablam.com/{slug})
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Plan</label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full border rounded-lg p-3"
              >
                <option value="free">Free</option>
                <option value="premium">Premium</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Días de trial
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={trialDays}
                onChange={(e) => setTrialDays(parseInt(e.target.value))}
                className="w-full border rounded-lg p-3"
              />
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end gap-4">
            <Link
              href="/superadmin/tenants"
              className="px-5 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Creando..." : "Crear Tenant"}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 text-sm text-gray-600">
        <p className="font-medium mb-2">Notas:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>El tenant será creado inmediatamente y aparecerá en la lista.</li>
          <li>
            Después de crear el tenant, puedes agregar branches (sucursales).
          </li>
          <li>El trial comenzará desde hoy y terminará en {trialDays} días.</li>
          <li>El slug debe ser único; si ya existe, se producirá un error.</li>
        </ul>
      </div>
    </div>
  );
}
