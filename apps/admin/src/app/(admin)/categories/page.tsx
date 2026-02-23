"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);

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
        .from("categories")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("position");

      setCategories(data || []);
    }

    loadData();
  }, []);

  const handleCreate = async (e: any) => {
    e.preventDefault();
    if (!tenantId) return;

    await supabase.from("categories").insert({
      tenant_id: tenantId,
      name,
      parent_id: parentId,
    });

    setName("");
    setParentId(null);

    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("position");

    setCategories(data || []);
  };

  const rootCategories = categories.filter((c) => !c.parent_id);
  const subCategories = categories.filter((c) => c.parent_id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Categorías</h1>

      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Nombre categoría"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select
          className="border p-2 w-full"
          value={parentId || ""}
          onChange={(e) =>
            setParentId(e.target.value || null)
          }
        >
          <option value="">Categoría raíz</option>
          {rootCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

        <button className="bg-black text-white px-4 py-2 rounded">
          Crear Categoría
        </button>
      </form>

      <div className="space-y-4">
        {rootCategories.map((cat) => (
          <div key={cat.id}>
            <div className="bg-black p-4 rounded shadow font-semibold">
              {cat.name}
            </div>

            {subCategories
              .filter((sub) => sub.parent_id === cat.id)
              .map((sub) => (
                <div
                  key={sub.id}
                  className="ml-6 mt-2 bg-black p-3 rounded"
                >
                  {sub.name}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
