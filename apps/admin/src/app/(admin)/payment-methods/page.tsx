"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [affectsCash, setAffectsCash] = useState(false);
  const [requiresReference, setRequiresReference] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
      .from("payment_methods")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("created_at", { ascending: false });

    setMethods(data || []);
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();

    if (!tenantId || !name) {
      alert("Completa los campos");
      return;
    }

    const { error } = await supabase.from("payment_methods").insert({
      tenant_id: tenantId,
      name,
      type,
      affects_cash: affectsCash,
      requires_reference: requiresReference,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    setAffectsCash(false);
    setRequiresReference(false);

    loadData();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase
      .from("payment_methods")
      .update({ is_active: !current })
      .eq("id", id);

    loadData();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Medios de Pago
      </h1>

      {/* Formulario */}
      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Nombre (Ej: Efectivo)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select
          className="border p-2 w-full"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="cash">Efectivo</option>
          <option value="card">Tarjeta</option>
          <option value="transfer">Transferencia</option>
          <option value="qr">QR</option>
          <option value="other">Otro</option>
        </select>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={affectsCash}
            onChange={(e) =>
              setAffectsCash(e.target.checked)
            }
          />
          Afecta caja física
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requiresReference}
            onChange={(e) =>
              setRequiresReference(e.target.checked)
            }
          />
          Requiere referencia (comprobante)
        </label>

        <button className="bg-white text-black px-4 py-2 rounded">
          Crear Medio de Pago
        </button>
      </form>

      {/* Lista */}
      <div className="space-y-4">
        {methods.map((method) => (
          <div
            key={method.id}
            className="bg-gray-800 p-4 rounded flex justify-between"
          >
            <div>
              <div className="font-semibold">
                {method.name}
              </div>
              <div className="text-xs text-gray-400">
                {method.type}
              </div>
            </div>

            <button
              onClick={() =>
                toggleActive(method.id, method.is_active)
              }
              className="text-xs underline"
            >
              {method.is_active ? "Desactivar" : "Activar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}