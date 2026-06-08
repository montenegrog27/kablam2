"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function DeliverySettingsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [baseCost, setBaseCost] = useState(0);
  const [pricePerKm, setPricePerKm] = useState(0);
  const [freeRadius, setFreeRadius] = useState(0);
  const [maxDistance, setMaxDistance] = useState(0);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;

    setTenantId(userRecord.tenant_id);

    const { data } = await supabase
      .from("delivery_settings")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .single();

    if (data) {
      setEnabled(data.enabled);
      setBaseCost(Number(data.base_delivery_cost));
      setPricePerKm(Number(data.price_per_km));
      setFreeRadius(Number(data.free_shipping_radius));
      setMaxDistance(Number(data.max_distance_km));
    }
  };

  const save = async () => {
    if (!tenantId) return;

    // Try update first, then insert if doesn't exist
    const { data: existing } = await supabase
      .from("delivery_settings")
      .select("id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existing) {
      await supabase.from("delivery_settings").update({
        enabled, base_delivery_cost: baseCost, price_per_km: pricePerKm,
        free_shipping_radius: freeRadius, max_distance_km: maxDistance,
      }).eq("id", existing.id);
    } else {
      await supabase.from("delivery_settings").insert({
        tenant_id: tenantId, enabled, base_delivery_cost: baseCost,
        price_per_km: pricePerKm, free_shipping_radius: freeRadius,
        max_distance_km: maxDistance,
      });
    }

    alert("Configuración guardada");
  };

  return (
    <div className="p-6 space-y-4 bg-gray-800">
      <h1 className="text-2xl font-bold">Configuración Delivery</h1>

      <label className="flex gap-2 items-center">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Delivery habilitado
      </label>

    <div>  costo base </div>
      <input
        type="number"
        placeholder="Costo base"
        value={baseCost}
        onChange={(e) => setBaseCost(Number(e.target.value))}
        className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 w-full"
      />
          <div>  precio por km </div>

      <input
        type="number"
        placeholder="Precio por km"
        value={pricePerKm}
        onChange={(e) => setPricePerKm(Number(e.target.value))}
        className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 w-full"
      />
    <div>  Radio envío gratis </div>

      <input
        type="number"
        placeholder="Radio envío gratis (km)"
        value={freeRadius}
        onChange={(e) => setFreeRadius(Number(e.target.value))}
        className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 w-full"
      />
    <div>  Distancia máxima </div>

      <input
        type="number"
        placeholder="Distancia máxima (km)"
        value={maxDistance}
        onChange={(e) => setMaxDistance(Number(e.target.value))}
        className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 w-full"
      />

      <button
        onClick={save}
        className="bg-black text-white px-4 py-2 rounded"
      >
        Guardar
      </button>
    </div>
  );
}