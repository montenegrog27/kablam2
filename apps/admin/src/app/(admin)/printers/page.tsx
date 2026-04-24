"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function PrintersPage() {
  const [printers, setPrinters] = useState<any[]>([]);
  const [kitchens, setKitchens] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("network");
  const [ip, setIp] = useState("");
  const [kitchenId, setKitchenId] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;

    setTenantId(userRecord.tenant_id);
    setBranchId(userRecord.branch_id);

    const { data: printersData } = await supabase
      .from("printers")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .eq("branch_id", userRecord.branch_id);

    setPrinters(printersData || []);

    const { data: kitchensData } = await supabase
      .from("kitchens")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .eq("branch_id", userRecord.branch_id);

    setKitchens(kitchensData || []);
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !branchId || !name) return;

    const { data: printer } = await supabase
      .from("printers")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        name,
        type,
        ip_address: type === "network" ? ip : null,
      })
      .select()
      .single();

    if (kitchenId && printer) {
      await supabase.from("kitchen_printers").insert({
        tenant_id: tenantId,
        kitchen_id: kitchenId,
        printer_id: printer.id,
      });
    }

    setName("");
    setIp("");
    setKitchenId("");

    loadData();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Impresoras</h1>

      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Nombre impresora"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select
          className="border p-2 w-full"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="network">Network (IP)</option>
          <option value="usb">USB</option>
          <option value="raspberry">Raspberry</option>
        </select>

        {type === "network" && (
          <input
            className="border p-2 w-full"
            placeholder="IP Address"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
          />
        )}

        <select
          className="border p-2 w-full"
          value={kitchenId}
          onChange={(e) => setKitchenId(e.target.value)}
        >
          <option value="">Asignar a cocina</option>
          {kitchens.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>

        <button className="bg-black text-white px-4 py-2 rounded">
          Crear Impresora
        </button>
      </form>

      <div className="space-y-4">
        {printers.map((printer) => (
          <div
            key={printer.id}
            className="bg-gray-800 p-4 rounded shadow"
          >
            <div className="font-semibold">{printer.name}</div>
            <div className="text-sm text-gray-400">
              Tipo: {printer.type}
            </div>
            {printer.ip_address && (
              <div className="text-sm text-gray-400">
                IP: {printer.ip_address}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}