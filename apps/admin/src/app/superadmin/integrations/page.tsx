"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

type Tenant = {
  id: string;
  name: string;
  slug: string;
};

type Integration = {
  id: string;
  tenant_id: string;
  provider: string;
  access_token_masked?: string | null;
  public_key_masked?: string | null;
  status: string;
  updated_at: string;
};

export default function SuperadminIntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [status, setStatus] = useState("active");

  const integrationByTenant = useMemo(
    () => Object.fromEntries(integrations.map((integration) => [integration.tenant_id, integration])),
    [integrations],
  );

  useEffect(() => {
    void load();
  }, []);

  const authHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("No hay sesion activa.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/superadmin/integrations", {
        headers: await authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar integraciones.");
      setTenants(data.tenants || []);
      setIntegrations(data.integrations || []);
      if (!tenantId && data.tenants?.[0]) setTenantId(data.tenants[0].id);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId) return;

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/superadmin/integrations", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ tenantId, accessToken, publicKey, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      setMessage("Integracion guardada.");
      setAccessToken("");
      setPublicKey("");
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedIntegration = tenantId ? integrationByTenant[tenantId] : null;

  if (loading) {
    return <div className="p-8 text-gray-700">Cargando integraciones...</div>;
  }

  return (
    <div className="p-8 text-gray-950">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Integraciones por tenant</h1>
        <p className="mt-1 text-sm text-gray-600">
          Configura credenciales privadas por negocio. El Access Token se guarda server-side y no se muestra completo.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={save} className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Mercado Pago</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Tenant</label>
              <select
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.slug})
                  </option>
                ))}
              </select>
              {selectedIntegration && (
                <p className="mt-2 text-xs text-gray-500">
                  Token actual: <span className="font-semibold">{selectedIntegration.access_token_masked || "sin token"}</span>
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Access Token de produccion</label>
              <input
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="APP_USR-..."
                type="password"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-gray-500">
                Dejalo vacio si solo queres cambiar estado o Public Key sin reemplazar el token.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Public Key opcional</label>
              <input
                value={publicKey}
                onChange={(event) => setPublicKey(event.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="APP_USR-..."
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Estado</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="active">Activo</option>
                <option value="disabled">Deshabilitado</option>
              </select>
            </div>

            <button
              disabled={saving || !tenantId}
              className="w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar integracion"}
            </button>
          </div>
        </form>

        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="font-bold">Tenants configurados</h2>
          </div>
          <div className="divide-y">
            {tenants.map((tenant) => {
              const integration = integrationByTenant[tenant.id];
              return (
                <div key={tenant.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-semibold">{tenant.name}</p>
                    <p className="text-xs text-gray-500">{tenant.slug}</p>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                      integration?.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {integration?.access_token_masked ? integration.status : "sin token"}
                    </span>
                    {integration?.access_token_masked && (
                      <p className="mt-1 text-xs text-gray-500">{integration.access_token_masked}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {message && (
        <div className="mt-5 rounded-lg border bg-white px-4 py-3 text-sm text-gray-700">
          {message}
        </div>
      )}
    </div>
  );
}
