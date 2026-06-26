"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

type Branch = {
  id: string;
  name: string;
  slug: string;
  lat?: number | null;
  lng?: number | null;
};

type DeliverySettings = {
  id?: string;
  tenant_id: string;
  branch_id?: string | null;
  enabled: boolean;
  base_delivery_cost: number;
  price_per_km: number;
  free_shipping_radius: number;
  max_distance_km: number;
};

const emptySettings = {
  enabled: false,
  base_delivery_cost: 0,
  price_per_km: 0,
  free_shipping_radius: 0,
  max_distance_km: 0,
};

export default function DeliverySettingsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userBranchId, setUserBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("global");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [baseCost, setBaseCost] = useState(0);
  const [pricePerKm, setPricePerKm] = useState(0);
  const [freeRadius, setFreeRadius] = useState(0);
  const [maxDistance, setMaxDistance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) || null,
    [branches, selectedBranchId],
  );

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    loadSettings(tenantId, selectedBranchId);
  }, [tenantId, selectedBranchId]);

  const applySettings = (settings?: Partial<DeliverySettings> | null) => {
    setSettingsId(settings?.id || null);
    setEnabled(settings?.enabled ?? emptySettings.enabled);
    setBaseCost(Number(settings?.base_delivery_cost ?? emptySettings.base_delivery_cost));
    setPricePerKm(Number(settings?.price_per_km ?? emptySettings.price_per_km));
    setFreeRadius(Number(settings?.free_shipping_radius ?? emptySettings.free_shipping_radius));
    setMaxDistance(Number(settings?.max_distance_km ?? emptySettings.max_distance_km));
  };

  const loadInitialData = async () => {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);
    setUserBranchId(userRecord.branch_id || null);

    let branchesQuery = supabase
      .from("branches")
      .select("id, name, slug, lat, lng")
      .eq("tenant_id", userRecord.tenant_id)
      .or("active.is.null,active.eq.true")
      .order("name");

    if (userRecord.branch_id) {
      branchesQuery = branchesQuery.eq("id", userRecord.branch_id);
    }

    const { data: branchRows } = await branchesQuery;
    setBranches(branchRows || []);

    if (userRecord.branch_id) {
      setSelectedBranchId(userRecord.branch_id);
    }

    setLoading(false);
  };

  const loadSettings = async (nextTenantId: string, branchId: string) => {
    const query = supabase
      .from("delivery_settings")
      .select("*")
      .eq("tenant_id", nextTenantId);

    const { data, error } =
      branchId === "global"
        ? await query.is("branch_id", null).maybeSingle()
        : await query.eq("branch_id", branchId).maybeSingle();

    if (error) {
      console.error("Error loading delivery settings:", error);
      applySettings(null);
      return;
    }

    applySettings(data);
  };

  const save = async () => {
    if (!tenantId) return;

    setSaving(true);
    const payload = {
      tenant_id: tenantId,
      branch_id: selectedBranchId === "global" ? null : selectedBranchId,
      enabled,
      base_delivery_cost: baseCost,
      price_per_km: pricePerKm,
      free_shipping_radius: freeRadius,
      max_distance_km: maxDistance,
    };

    const { error } = settingsId
      ? await supabase.from("delivery_settings").update(payload).eq("id", settingsId)
      : await supabase.from("delivery_settings").insert(payload);

    setSaving(false);

    if (error) {
      alert("No se pudo guardar delivery: " + error.message);
      return;
    }

    await loadSettings(tenantId, selectedBranchId);
    alert("Configuracion de delivery guardada");
  };

  if (loading) {
    return <div className="p-6 text-gray-100">Cargando delivery...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-gray-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Configuracion Delivery</h1>
          <p className="mt-1 text-sm text-gray-400">
            Defini un fallback global o una configuracion especifica por sucursal.
          </p>
        </div>

        <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">Sucursal</label>
            <select
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              disabled={Boolean(userBranchId)}
            >
              {!userBranchId && <option value="global">Global del tenant</option>}
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.slug})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              Customer usa primero la configuracion de la sucursal y, si no existe, la global.
            </p>
          </div>

          {selectedBranch && (!selectedBranch.lat || !selectedBranch.lng) && (
            <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
              Esta sucursal no tiene latitud y longitud cargadas. Configuralas en Sucursales para que el envio se calcule.
            </div>
          )}

          <label className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
            <span className="text-sm font-medium">Delivery habilitado</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-4 w-4"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Costo base">
              <input
                type="number"
                value={baseCost}
                onChange={(event) => setBaseCost(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              />
            </Field>

            <Field label="Precio por km">
              <input
                type="number"
                value={pricePerKm}
                onChange={(event) => setPricePerKm(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              />
            </Field>

            <Field label="Radio envio gratis (km)">
              <input
                type="number"
                value={freeRadius}
                onChange={(event) => setFreeRadius(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              />
            </Field>

            <Field label="Distancia maxima (km)">
              <input
                type="number"
                value={maxDistance}
                onChange={(event) => setMaxDistance(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              />
            </Field>
          </div>

          <div className="flex justify-end border-t border-gray-800 pt-4">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar delivery"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-300">{label}</span>
      {children}
    </label>
  );
}
