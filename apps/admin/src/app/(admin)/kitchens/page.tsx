"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function KitchensPage() {
  const [kitchens, setKitchens] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [kitchenCategories, setKitchenCategories] = useState<any[]>([]);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("kitchen");
  const [color, setColor] = useState("#000000");
  const [isActive, setIsActive] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);

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

    const [
      { data: kitchensData },
      { data: categoriesData },
      { data: kitchenCategoriesData },
    ] = await Promise.all([
      supabase
        .from("kitchens")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("branch_id", userRecord.branch_id),

      supabase
        .from("categories")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id),

      supabase
        .from("kitchen_categories")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id),
    ]);

    setKitchens(kitchensData || []);
    setCategories(categoriesData || []);
    setKitchenCategories(kitchenCategoriesData || []);
  };

  const resetForm = () => {
    setName("");
    setType("kitchen");
    setColor("#000000");
    setIsActive(true);
    setEditingId(null);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !branchId || !name) return;

    if (editingId) {
      await supabase
        .from("kitchens")
        .update({ name, type, color, is_active: isActive })
        .eq("id", editingId);
    } else {
      await supabase.from("kitchens").insert({
        tenant_id: tenantId,
        branch_id: branchId,
        name,
        type,
        color,
        is_active: isActive,
      });
    }

    resetForm();
    loadData();
  };

  const toggleCategory = async (kitchenId: string, categoryId: string) => {
    const existing = kitchenCategories.find(
      (kc) =>
        kc.kitchen_id === kitchenId &&
        kc.category_id === categoryId
    );

    if (existing) {
      await supabase
        .from("kitchen_categories")
        .delete()
        .eq("id", existing.id);
    } else {
      await supabase.from("kitchen_categories").insert({
        tenant_id: tenantId,
        kitchen_id: kitchenId,
        category_id: categoryId,
      });
    }

    loadData();
  };

  const isCategoryAssigned = (
    kitchenId: string,
    categoryId: string
  ) => {
    return kitchenCategories.some(
      (kc) =>
        kc.kitchen_id === kitchenId &&
        kc.category_id === categoryId
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Cocinas</h1>

      {/* Formulario */}
      <form
        onSubmit={handleSubmit}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Nombre cocina"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select
          className="border bg-gray-900 p-2 w-full"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="kitchen">Cocina</option>
          <option value="bar">Barra</option>
          <option value="fryer">Freidora</option>
          <option value="assembly">Armado</option>
          <option value="other">Otro</option>
        </select>

        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={() => setIsActive(!isActive)}
          />
          Activa
        </label>

        <button className="bg-black text-white px-4 py-2 rounded">
          {editingId ? "Actualizar Cocina" : "Crear Cocina"}
        </button>
      </form>

      {/* Lista */}
      <div className="space-y-6">
        {kitchens.map((kitchen) => (
          <div
            key={kitchen.id}
            className="bg-gray-800 p-4 rounded shadow"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="font-semibold text-lg">
                {kitchen.name}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={isCategoryAssigned(
                      kitchen.id,
                      cat.id
                    )}
                    onChange={() =>
                      toggleCategory(
                        kitchen.id,
                        cat.id
                      )
                    }
                  />
                  {cat.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}