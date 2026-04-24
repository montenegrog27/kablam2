"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useParams } from "next/navigation";

export default function RecipePage() {
  const { variantId } = useParams();

  const [variant, setVariant] = useState<any>(null);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState("");
  const [quantity, setQuantity] = useState("");

  useEffect(() => {
    if (!variantId) return;

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

      const { data: ing } = await supabase
        .from("ingredients")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id);

      setIngredients(ing || []);

      await loadRecipe();

      const { data: variantData } = await supabase
        .from("product_variants")
        .select("*")
        .eq("id", variantId)
        .single();

      setVariant(variantData);
    }

    loadData();

    // 🔥 SUBSCRIPCIÓN REALTIME
    const channel = supabase
      .channel("ingredients-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ingredients",
        },
        async () => {
          // Si cambia cualquier ingrediente → recargamos receta
          await loadRecipe();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [variantId]);

  const loadRecipe = async () => {
    const { data: recipe } = await supabase
      .from("product_recipes")
      .select("*, ingredients(*)")
      .eq("variant_id", variantId);

    setRecipeItems(recipe || []);
    await updateVariantCost(recipe || []);
  };

  const calculateTotalCost = (items: any[]) => {
    return items.reduce((acc, item) => {
      const unitCost = item.ingredients?.cost_per_unit || 0;
      return acc + unitCost * item.quantity;
    }, 0);
  };

  const updateVariantCost = async (items: any[]) => {
    const total = calculateTotalCost(items);

    await supabase
      .from("product_variants")
      .update({ cost: total })
      .eq("id", variantId);

    setVariant((prev: any) =>
      prev ? { ...prev, cost: total } : prev
    );
  };

  const handleAddIngredient = async (e: any) => {
    e.preventDefault();

    if (!selectedIngredient || !quantity) return;

    await supabase.from("product_recipes").insert({
      variant_id: variantId,
      ingredient_id: selectedIngredient,
      quantity: Number(quantity),
    });

    setSelectedIngredient("");
    setQuantity("");

    await loadRecipe();
  };

  const totalCost = calculateTotalCost(recipeItems);
  const price = variant?.price || 0;
  const profit = price - totalCost;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Receta</h1>

      {/* Formulario */}
      <form
        onSubmit={handleAddIngredient}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <select
          className="border bg-gray-900 p-2 w-full"
          value={selectedIngredient}
          onChange={(e) => setSelectedIngredient(e.target.value)}
        >
          <option value="">Seleccionar ingrediente</option>
          {ingredients.map((ing) => (
            <option key={ing.id} value={ing.id}>
              {ing.name} ({ing.unit})
            </option>
          ))}
        </select>

        <input
          className="border p-2 w-full"
          type="number"
          placeholder="Cantidad"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />

        <button className="bg-black text-white px-4 py-2 rounded">
          Agregar
        </button>
      </form>

      {/* Lista receta */}
      <div className="space-y-3">
        {recipeItems.map((item) => (
          <div
            key={item.id}
            className="bg-black p-4 rounded shadow flex justify-between"
          >
            <div>
              {item.ingredients?.name} — {item.quantity}{" "}
              {item.ingredients?.unit}
            </div>
            <div>
              $
              {(
                item.quantity *
                (item.ingredients?.cost_per_unit || 0)
              ).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Resumen financiero */}
      <div className="mt-6 bg-gray-900 p-4 rounded space-y-2">
        <div className="flex justify-between">
          <span>Precio:</span>
          <span>${price.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span>Costo:</span>
          <span>${totalCost.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span>Ganancia:</span>
          <span className="font-bold">
            ${profit.toFixed(2)}
          </span>
        </div>

        <div className="flex justify-between">
          <span>Margen:</span>
          <span className="font-bold">
            {margin.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}