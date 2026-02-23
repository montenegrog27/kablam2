"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function DayPartsPage() {
  const [parts, setParts] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

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
        .from("day_parts")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("position");

      setParts(data || []);
    }

    loadData();
  }, []);

  const handleCreate = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !name || !start || !end) return;

    const { error } = await supabase.from("day_parts").insert({
      tenant_id: tenantId,
      name,
      start_time: start,
      end_time: end,
      position: parts.length,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    setStart("");
    setEnd("");

    const { data } = await supabase
      .from("day_parts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("position");

    setParts(data || []);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Turnos / Horarios</h1>

      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Nombre (Desayuno, Cena...)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex gap-4">
          <input
            type="time"
            className="border p-2 w-full"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <input
            type="time"
            className="border p-2 w-full"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>

        <button className="bg-white text-black px-4 py-2 rounded">
          Crear
        </button>
      </form>

      <div className="space-y-3">
        {parts.map((part) => (
          <div
            key={part.id}
            className="bg-black p-4 rounded shadow flex justify-between"
          >
            <span>
              {part.name} ({part.start_time} - {part.end_time})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
