"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function VariantTypesPage() {
  const [types, setTypes] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    async function loadData() {
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
        .from("variant_types")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("position");

      setTypes(data || []);
    }

    loadData();
  }, []);

  const handleCreate = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !name) return;

    const { error } = await supabase.from("variant_types").insert({
      tenant_id: tenantId,
      name,
      position: types.length,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setName("");

    const { data } = await supabase
      .from("variant_types")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("position");

    setTypes(data || []);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tipos de Variante</h1>

      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Ej: Simple, Doble, Grande"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button className="bg-white text-black px-4 py-2 rounded">
          Crear
        </button>
      </form>

      <div className="space-y-3">
        {types.map((type) => (
          <div
            key={type.id}
            className="bg-black p-4 rounded shadow flex justify-between"
          >
            <span>{type.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
