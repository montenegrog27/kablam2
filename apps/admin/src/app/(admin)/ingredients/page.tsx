"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("g");
  const [cost, setCost] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCost, setEditingCost] = useState("");

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
      .from("ingredients")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("created_at", { ascending: false });

    setIngredients(data || []);
  };

  // 🔥 RECALCULAR TODAS LAS VARIANTES AFECTADAS
  const recalcVariantsUsingIngredient = async (ingredientId: string) => {
    const { data: recipes } = await supabase
      .from("product_recipes")
      .select("variant_id")
      .eq("ingredient_id", ingredientId);

    if (!recipes) return;

    const uniqueVariantIds = [
      ...new Set(recipes.map((r) => r.variant_id)),
    ];

    for (const variantId of uniqueVariantIds) {
      const { data: items } = await supabase
        .from("product_recipes")
        .select("quantity, ingredients(cost_per_unit)")
        .eq("variant_id", variantId);

      if (!items) continue;

      const total = items.reduce((acc: number, item: any) => {
        return (
          acc +
          item.quantity * (item.ingredients?.cost_per_unit || 0)
        );
      }, 0);

      await supabase
        .from("product_variants")
        .update({ cost: total })
        .eq("id", variantId);
    }
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();

    if (!tenantId || !name || !cost) return;

    await supabase.from("ingredients").insert({
      tenant_id: tenantId,
      name,
      unit,
      cost_per_unit: Number(cost),
    });

    setName("");
    setCost("");
    loadData();
  };

  // ✏ EDITAR COSTO
  const handleUpdateCost = async (id: string) => {
    await supabase
      .from("ingredients")
      .update({ cost_per_unit: Number(editingCost) })
      .eq("id", id);

    setEditingId(null);
    setEditingCost("");

    await recalcVariantsUsingIngredient(id);
    loadData();
  };

  // 🗑 ELIMINAR
  const handleDelete = async (id: string) => {
    await supabase
      .from("ingredients")
      .delete()
      .eq("id", id);

    await recalcVariantsUsingIngredient(id);
    loadData();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Ingredientes
      </h1>

      {/* Crear */}
      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Nombre ingrediente"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select
          className="border bg-gray-900 p-2 w-full"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          <option value="g">Gramos</option>
          <option value="ml">Mililitros</option>
          <option value="unidad">Unidad</option>
          <option value="kg">Kilogramo</option>
          <option value="litro">Litro</option>
        </select>

        <input
          className="border p-2 w-full"
          type="number"
          placeholder="Costo por unidad"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />

        <button className="bg-black text-white px-4 py-2 rounded">
          Crear Ingrediente
        </button>
      </form>

      {/* Lista */}
      <div className="space-y-4">
        {ingredients.map((ing) => (
          <div
            key={ing.id}
            className="bg-gray-800 p-4 rounded shadow flex justify-between items-center"
          >
            <div>
              <div className="font-semibold">
                {ing.name}
              </div>
              <div className="text-sm text-gray-400">
                Unidad: {ing.unit}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {editingId === ing.id ? (
                <>
                  <input
                    type="number"
                    className="border p-1 w-24"
                    value={editingCost}
                    onChange={(e) =>
                      setEditingCost(e.target.value)
                    }
                  />
                  <button
                    onClick={() =>
                      handleUpdateCost(ing.id)
                    }
                    className="text-green-400"
                  >
                    ✔
                  </button>
                </>
              ) : (
                <>
                  <div className="font-semibold">
                    ${ing.cost_per_unit}
                  </div>
                  <button
                    onClick={() => {
                      setEditingId(ing.id);
                      setEditingCost(
                        ing.cost_per_unit
                      );
                    }}
                    className="text-blue-400"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() =>
                      handleDelete(ing.id)
                    }
                    className="text-red-500"
                  >
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}