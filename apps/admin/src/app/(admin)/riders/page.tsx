"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function RidersPage() {
  const [riders, setRiders] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;

    setTenantId(userRecord.tenant_id);

    // Cargar branches
    const { data: branchesData } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    setBranches(branchesData || []);

    // Cargar riders
    const { data: ridersData } = await supabase
      .from("riders")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    setRiders(ridersData || []);
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();

    if (!tenantId || !name || !phone || !branchId) {
      alert("Completa todos los campos obligatorios");
      return;
    }

    const phoneNormalized = phone.replace(/\D/g, "");

    const { error } = await supabase.from("riders").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name,
      phone: phoneNormalized,
      email: email || null,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    setPhone("");
    setEmail("");
    setBranchId("");

    loadData();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("riders").update({ is_active: !current }).eq("id", id);

    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este rider?")) return;

    await supabase.from("riders").delete().eq("id", id);
    loadData();
  };

  const getBranchName = (bId: string) => {
    const branch = branches.find((b) => b.id === bId);
    return branch?.name || "Sin sucursal";
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Repartidores</h1>

      {/* Formulario */}
      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
            <input
              className="border p-2 w-full bg-white/10"
              placeholder="Nombre completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Teléfono *
            </label>
            <input
              className="border p-2 w-full bg-white/10"
              placeholder="Ej: 5493794094455"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <input
              type="email"
              className="border p-2 w-full bg-white/10"
              placeholder="email@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Sucursal *
            </label>
            <select
              className="border p-2 w-full bg-white/10"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Seleccionar sucursal</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="bg-white text-black px-4 py-2 rounded">
          Crear Repartidor
        </button>
      </form>

      {/* Lista */}
      <div className="space-y-4">
        {riders.length === 0 && (
          <p className="text-gray-500">No hay repartidores creados</p>
        )}

        {riders.map((rider) => (
          <div
            key={rider.id}
            className={`bg-gray-800 p-4 rounded flex justify-between items-center ${
              !rider.is_active ? "opacity-50" : ""
            }`}
          >
            <div>
              <div className="font-semibold flex items-center gap-2">
                {rider.name}
                {!rider.is_active && (
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                    Inactivo
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-400">
                {rider.phone}
                {rider.email && ` • ${rider.email}`}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                📍 {getBranchName(rider.branch_id)}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => toggleActive(rider.id, rider.is_active)}
                className="text-xs underline"
              >
                {rider.is_active ? "Desactivar" : "Activar"}
              </button>
              <button
                onClick={() => handleDelete(rider.id)}
                className="text-xs underline text-red-400"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
