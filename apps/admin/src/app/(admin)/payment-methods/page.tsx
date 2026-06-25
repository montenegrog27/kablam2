"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Pencil, X } from "lucide-react";

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [affectsCash, setAffectsCash] = useState(false);
  const [requiresReference, setRequiresReference] = useState(false);
  const [editingMethod, setEditingMethod] = useState<any | null>(null);

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

  const resetForm = () => {
    setName("");
    setType("cash");
    setAffectsCash(false);
    setRequiresReference(false);
    setEditingMethod(null);
  };

  const startEdit = (method: any) => {
    setEditingMethod(method);
    setName(method.name || "");
    setType(method.type || "cash");
    setAffectsCash(Boolean(method.affects_cash));
    setRequiresReference(Boolean(method.requires_reference));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!tenantId || !name) {
      alert("Completa los campos");
      return;
    }

    const payload = {
      tenant_id: tenantId,
      name: name.trim(),
      type,
      affects_cash: affectsCash,
      requires_reference: requiresReference,
    };

    const { error } = editingMethod
      ? await supabase
          .from("payment_methods")
          .update(payload)
          .eq("id", editingMethod.id)
          .eq("tenant_id", tenantId)
      : await supabase.from("payment_methods").insert(payload);

    if (error) {
      alert(error.message);
      return;
    }

    resetForm();
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
        onSubmit={handleSubmit}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">
              {editingMethod ? "Editar medio de pago" : "Nuevo medio de pago"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Configura como aparece y como impacta en caja.
            </p>
          </div>
          {editingMethod && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-700 p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
              title="Cancelar edición"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <input
          className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 w-full"
          placeholder="Nombre (Ej: Efectivo)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select
          className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 w-full"
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

        <button className="bg-gray-900 text-white px-4 py-2 rounded">
          {editingMethod ? "Guardar cambios" : "Crear Medio de Pago"}
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

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => startEdit(method)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700"
              >
                <Pencil size={13} />
                Editar
              </button>
              <button
                onClick={() =>
                  toggleActive(method.id, method.is_active)
                }
                className="text-xs underline"
              >
                {method.is_active ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
