"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("g");
  const [cost, setCost] = useState("");
  const [salePrice, setSalePrice] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCost, setEditingCost] = useState("");
  const [editingSalePrice, setEditingSalePrice] = useState("");

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

  const recalcVariantsUsingIngredient = async (ingredientId: string) => {
    const { data: recipes } = await supabase
      .from("product_recipes")
      .select("variant_id")
      .eq("ingredient_id", ingredientId);

    if (!recipes) return;

    const uniqueVariantIds = [...new Set(recipes.map((r) => r.variant_id))];

    for (const variantId of uniqueVariantIds) {
      const { data: items } = await supabase
        .from("product_recipes")
        .select("quantity, ingredients(cost_per_unit)")
        .eq("variant_id", variantId);

      if (!items) continue;

      const total = items.reduce((acc: number, item: any) => {
        return acc + item.quantity * (item.ingredients?.cost_per_unit || 0);
      }, 0);

      await supabase
        .from("product_variants")
        .update({ cost: total })
        .eq("id", variantId);
    }
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();

    if (!tenantId || !name || !cost) {
      alert("Completá nombre y costo");
      return;
    }

    const sale = Number(salePrice) || Number(cost);

    await supabase.from("ingredients").insert({
      tenant_id: tenantId,
      name,
      unit,
      cost_per_unit: Number(cost),
      sale_price: sale,
    });

    setName("");
    setCost("");
    setSalePrice("");
    loadData();
  };

  const handleUpdate = async (id: string) => {
    await supabase
      .from("ingredients")
      .update({
        cost_per_unit: Number(editingCost),
        sale_price: Number(editingSalePrice) || Number(editingCost),
      })
      .eq("id", id);

    setEditingId(null);

    await recalcVariantsUsingIngredient(id);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este ingrediente?")) return;

    await supabase.from("ingredients").delete().eq("id", id);
    loadData();
  };

  const startEdit = (ing: any) => {
    setEditingId(ing.id);
    setEditingCost(ing.cost_per_unit?.toString() || "");
    setEditingSalePrice(
      ing.sale_price?.toString() || ing.cost_per_unit?.toString() || "",
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Ingredientes</h1>

      {/* Crear */}
      <form onSubmit={handleCreate} className="bg-gray-900 p-6 rounded-lg mb-8">
        <h2 className="font-semibold mb-4">Nuevo Ingrediente</h2>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre</label>
            <input
              className="border p-2 w-full rounded bg-gray-800"
              placeholder="Ej: Panceta"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Unidad</label>
            <select
              className="border p-2 w-full rounded bg-gray-800"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="g">Gramos</option>
              <option value="ml">Mililitros</option>
              <option value="unidad">Unidad</option>
              <option value="kg">Kilogramo</option>
              <option value="litro">Litro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Costo (stock)
            </label>
            <input
              className="border p-2 w-full rounded bg-gray-800"
              type="number"
              placeholder="Precio de costo"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Precio venta
            </label>
            <input
              className="border p-2 w-full rounded bg-gray-800"
              type="number"
              placeholder="Precio al cliente"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-2 mb-4">
          Costo = para stock. Precio venta = lo que paga el cliente al agregarlo
          como extra.
        </p>

        <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Crear Ingrediente
        </button>
      </form>

      {/* Lista */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="grid grid-cols-6 gap-4 p-4 border-b border-gray-800 text-xs text-gray-400 uppercase">
          <div>Nombre</div>
          <div>Unidad</div>
          <div>Costo</div>
          <div>Precio Venta</div>
          <div>Margen</div>
          <div>Acciones</div>
        </div>

        {ingredients.map((ing) => (
          <div
            key={ing.id}
            className="grid grid-cols-6 gap-4 p-4 border-b border-gray-800 items-center hover:bg-gray-800/50"
          >
            {editingId === ing.id ? (
              <>
                <div className="col-span-1 font-medium">{ing.name}</div>
                <div className="col-span-1 text-gray-400">{ing.unit}</div>
                <div className="col-span-1">
                  <input
                    type="number"
                    className="border p-1 w-full rounded bg-gray-800"
                    value={editingCost}
                    onChange={(e) => setEditingCost(e.target.value)}
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="number"
                    className="border p-1 w-full rounded bg-gray-800"
                    value={editingSalePrice}
                    onChange={(e) => setEditingSalePrice(e.target.value)}
                  />
                </div>
                <div className="col-span-1"></div>
                <div className="col-span-1 flex gap-2">
                  <button
                    onClick={() => handleUpdate(ing.id)}
                    className="text-green-400 hover:text-green-300"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-gray-400 hover:text-gray-300"
                  >
                    ✕
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="col-span-1 font-medium">{ing.name}</div>
                <div className="col-span-1 text-gray-400">{ing.unit}</div>
                <div className="col-span-1">
                  <span className="text-red-400">${ing.cost_per_unit}</span>
                </div>
                <div className="col-span-1">
                  <span className="text-green-400 font-semibold">
                    ${ing.sale_price || ing.cost_per_unit}
                  </span>
                </div>
                <div className="col-span-1">
                  {(() => {
                    const sale = ing.sale_price || ing.cost_per_unit;
                    const margen = sale - ing.cost_per_unit;
                    return (
                      <span
                        className={`text-xs ${margen >= 0 ? "text-green-500" : "text-red-500"}`}
                      >
                        {margen >= 0 ? "+" : ""}
                        {margen}
                      </span>
                    );
                  })()}
                </div>
                <div className="col-span-1 flex gap-2">
                  <button
                    onClick={() => startEdit(ing)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(ing.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {ingredients.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No hay ingredientes creados
          </div>
        )}
      </div>
    </div>
  );
}
