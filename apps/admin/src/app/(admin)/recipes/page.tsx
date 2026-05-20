"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Search, Plus, Trash2, DollarSign, Package, ChefHat, Box } from "lucide-react";

export default function RecipesPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [packagingItems, setPackagingItems] = useState<any[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [recipe, setRecipe] = useState<any[]>([]);
  const [packagingRecipe, setPackagingRecipe] = useState<any[]>([]);
  const [tab, setTab] = useState<"ingredients" | "packaging">("ingredients");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);

    const [{ data: prods }, { data: ing }, { data: pkg }] = await Promise.all([
      supabase.from("products").select("*, product_variants(*)").eq("tenant_id", r.tenant_id).order("name"),
      supabase.from("ingredients").select("*").eq("tenant_id", r.tenant_id).order("name"),
      supabase.from("packaging").select("*").eq("tenant_id", r.tenant_id).order("name"),
    ]);
    setProducts(prods || []);
    setIngredients(ing || []);
    setPackagingItems(pkg || []);
    setLoading(false);
  };

  const loadRecipe = async (variantId: string) => {
    if (!variantId) { setRecipe([]); setPackagingRecipe([]); return; }
    const [r1, r2] = await Promise.all([
      supabase.from("product_recipes").select("*, ingredients(id, name, cost_per_unit)").eq("variant_id", variantId),
      supabase.from("product_packaging").select("*, packaging(id, name, cost_per_unit)").eq("variant_id", variantId),
    ]);
    setRecipe(r1.data || []);
    setPackagingRecipe(r2.data || []);
  };

  const selectVariant = (variantId: string) => {
    setSelectedVariantId(variantId);
    loadRecipe(variantId);
  };

  const addIngredient = () => {
    setRecipe([...recipe, { variant_id: selectedVariantId, ingredient_id: "", quantity: 1, ingredients: { name: "", cost_per_unit: 0 }, _new: true }]);
  };

  const addPackaging = () => {
    setPackagingRecipe([...packagingRecipe, { variant_id: selectedVariantId, packaging_id: "", quantity: 1, packaging: { name: "", cost_per_unit: 0 }, _new: true }]);
  };

  const updateIngredient = (idx: number, field: string, value: any) => {
    const updated = [...recipe];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "ingredient_id") {
      updated[idx].ingredients = ingredients.find((i) => i.id === value) || { name: "", cost_per_unit: 0 };
    }
    setRecipe(updated);
  };

  const updatePackaging = (idx: number, field: string, value: any) => {
    const updated = [...packagingRecipe];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "packaging_id") {
      updated[idx].packaging = packagingItems.find((p) => p.id === value) || { name: "", cost_per_unit: 0 };
    }
    setPackagingRecipe(updated);
  };

  const removeRow = async (idx: number, type: "ingredients" | "packaging") => {
    const rows = type === "ingredients" ? recipe : packagingRecipe;
    const row = rows[idx];
    if (row.id && !row._new) {
      const table = type === "ingredients" ? "product_recipes" : "product_packaging";
      await supabase.from(table).delete().eq("id", row.id);
    }
    if (type === "ingredients") setRecipe(recipe.filter((_, i) => i !== idx));
    else setPackagingRecipe(packagingRecipe.filter((_, i) => i !== idx));
  };

  const saveRecipe = async () => {
    if (!selectedVariantId) return;
    setSaving(true);

    const allIngredientRows = [...recipe, ...packagingRecipe.map((p) => ({
      ...p,
      table: "product_packaging",
    }))];

    for (const row of recipe) {
      if (!row.ingredient_id) continue;
      const payload = { variant_id: selectedVariantId, ingredient_id: row.ingredient_id, quantity: Number(row.quantity) || 1 };
      if (row._new) await supabase.from("product_recipes").insert(payload);
      else if (row.id) await supabase.from("product_recipes").update(payload).eq("id", row.id);
    }

    for (const row of packagingRecipe) {
      if (!row.packaging_id) continue;
      const payload = { variant_id: selectedVariantId, packaging_id: row.packaging_id, quantity: Number(row.quantity) || 1 };
      if (row._new) await supabase.from("product_packaging").insert(payload);
      else if (row.id) await supabase.from("product_packaging").update(payload).eq("id", row.id);
    }

    let totalCost = 0;
    recipe.forEach((r) => { if (r.ingredients?.cost_per_unit) totalCost += (Number(r.quantity) || 1) * Number(r.ingredients.cost_per_unit); });
    packagingRecipe.forEach((r) => { if (r.packaging?.cost_per_unit) totalCost += (Number(r.quantity) || 1) * Number(r.packaging.cost_per_unit); });
    await supabase.from("product_variants").update({ cost: totalCost }).eq("id", selectedVariantId);

    setSaving(false);
    loadRecipe(selectedVariantId);
  };

  const ingredientCost = recipe.reduce((s, r) => s + (Number(r.quantity) || 1) * Number(r.ingredients?.cost_per_unit || 0), 0);
  const packagingCost = packagingRecipe.reduce((s, r) => s + (Number(r.quantity) || 1) * Number(r.packaging?.cost_per_unit || 0), 0);
  const totalCost = ingredientCost + packagingCost;

  const allVariants = products.flatMap((p) =>
    (p.product_variants || []).map((v: any) => ({ ...v, product_name: p.name }))
  ).filter((v: any) => search ? v.product_name.toLowerCase().includes(search.toLowerCase()) || v.name.toLowerCase().includes(search.toLowerCase()) : true)
  .sort((a: any, b: any) => a.product_name.localeCompare(b.product_name));

  const selectedVariant = allVariants.find((v: any) => v.id === selectedVariantId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Recetas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ingredientes + Packaging por producto</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: variant selector */}
        <div className="lg:col-span-1">
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                  placeholder="Buscar producto..." />
              </div>
            </div>
            <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
              {loading ? <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div> :
              allVariants.length === 0 ? <div className="p-8 text-center text-gray-600 text-sm">Sin productos</div> :
              allVariants.map((v: any) => (
                <button key={v.id} onClick={() => selectVariant(v.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-800/50 transition flex items-center gap-3 ${
                    selectedVariantId === v.id ? "bg-gray-800 border-l-2 border-emerald-500" : ""
                  }`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">{v.product_name}</p>
                    <p className="text-xs text-gray-500">{v.name} {v.price ? `· $${Number(v.price).toLocaleString("es-AR")}` : ""}</p>
                  </div>
                  {Number(v.cost) > 0 && <span className="text-xs text-gray-500 tabular-nums">C: ${Number(v.cost).toLocaleString("es-AR")}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: recipe editor */}
        <div className="lg:col-span-2">
          {!selectedVariantId ? (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-12 text-center">
              <Package size={48} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Seleccioná un producto</p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-100">{selectedVariant?.product_name}</h2>
                    <p className="text-xs text-gray-500">{selectedVariant?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Precio</p>
                    <p className="text-sm font-bold text-gray-100 tabular-nums">${Number(selectedVariant?.price || 0).toLocaleString("es-AR")}</p>
                  </div>
                </div>
              </div>

              {/* Cost summary */}
              <div className="grid grid-cols-4 gap-3 px-5 py-4 border-b border-gray-700 bg-gray-950/30">
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">Ingredientes</p>
                  <p className="text-sm font-bold text-orange-400 tabular-nums">${ingredientCost.toLocaleString("es-AR")}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">Packaging</p>
                  <p className="text-sm font-bold text-blue-400 tabular-nums">${packagingCost.toLocaleString("es-AR")}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">Costo Total</p>
                  <p className="text-sm font-bold text-orange-400 tabular-nums">${totalCost.toLocaleString("es-AR")}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">Margen</p>
                  <p className={`text-sm font-bold tabular-nums ${selectedVariant?.price > 0 ? (totalCost / Number(selectedVariant.price) * 100 < 35 ? "text-emerald-400" : "text-red-400") : "text-gray-500"}`}>
                    {selectedVariant?.price > 0 ? `${((1 - totalCost / Number(selectedVariant.price)) * 100).toFixed(0)}%` : "—"}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-700">
                <button onClick={() => setTab("ingredients")}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-medium transition ${
                    tab === "ingredients" ? "text-gray-100 border-b-2 border-emerald-500 bg-gray-800/30" : "text-gray-500 hover:text-gray-300"
                  }`}>
                  <ChefHat size={14} /> Ingredientes ({recipe.length})
                </button>
                <button onClick={() => setTab("packaging")}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-medium transition ${
                    tab === "packaging" ? "text-gray-100 border-b-2 border-blue-500 bg-gray-800/30" : "text-gray-500 hover:text-gray-300"
                  }`}>
                  <Box size={14} /> Packaging ({packagingRecipe.length})
                </button>
              </div>

              {/* Tab content */}
              <div className="p-5">
                {tab === "ingredients" && (
                  <>
                    <div className="space-y-2">
                      {recipe.map((row, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <select value={row.ingredient_id} onChange={(e) => updateIngredient(idx, "ingredient_id", e.target.value)}
                            className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                            <option value="">Seleccionar ingrediente</option>
                            {ingredients.filter((i) => i.name && i.cost_per_unit !== undefined).map((ing) => (
                              <option key={ing.id} value={ing.id}>{ing.name} (${Number(ing.cost_per_unit || 0).toLocaleString("es-AR")}/u)</option>
                            ))}
                          </select>
                          <input type="number" step="0.01" min="0" value={row.quantity}
                            onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                            className="w-20 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 text-center" placeholder="Cant" />
                          <div className="w-24 text-right text-sm text-gray-400 tabular-nums">
                            ${((Number(row.quantity) || 0) * Number(row.ingredients?.cost_per_unit || 0)).toLocaleString("es-AR")}
                          </div>
                          <button onClick={() => removeRow(idx, "ingredients")} className="p-1.5 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                    {recipe.length === 0 && <p className="text-center py-6 text-gray-600 text-sm">Sin ingredientes</p>}
                    <button onClick={addIngredient} className="mt-3 flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-gray-300 border border-gray-600 rounded-lg text-xs font-medium hover:bg-gray-700 transition">
                      <Plus size={13} /> Agregar ingrediente
                    </button>
                  </>
                )}

                {tab === "packaging" && (
                  <>
                    <div className="space-y-2">
                      {packagingRecipe.map((row, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <select value={row.packaging_id} onChange={(e) => updatePackaging(idx, "packaging_id", e.target.value)}
                            className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                            <option value="">Seleccionar packaging</option>
                            {packagingItems.filter((p) => p.name).map((pkg) => (
                              <option key={pkg.id} value={pkg.id}>{pkg.name} (${Number(pkg.cost_per_unit || 0).toLocaleString("es-AR")}/u)</option>
                            ))}
                          </select>
                          <input type="number" step="0.01" min="0" value={row.quantity}
                            onChange={(e) => updatePackaging(idx, "quantity", e.target.value)}
                            className="w-20 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 text-center" placeholder="Cant" />
                          <div className="w-24 text-right text-sm text-gray-400 tabular-nums">
                            ${((Number(row.quantity) || 0) * Number(row.packaging?.cost_per_unit || 0)).toLocaleString("es-AR")}
                          </div>
                          <button onClick={() => removeRow(idx, "packaging")} className="p-1.5 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                    {packagingRecipe.length === 0 && <p className="text-center py-6 text-gray-600 text-sm">Sin packaging asignado</p>}
                    <button onClick={addPackaging} className="mt-3 flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-gray-300 border border-gray-600 rounded-lg text-xs font-medium hover:bg-gray-700 transition">
                      <Plus size={13} /> Agregar packaging
                    </button>
                  </>
                )}

                <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-700">
                  <span className="text-xs text-gray-500">
                    {recipe.filter((r) => r.ingredient_id).length + packagingRecipe.filter((r) => r.packaging_id).length} item(s)
                  </span>
                  <button onClick={saveRecipe} disabled={saving}
                    className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 transition">
                    {saving ? "Guardando..." : "Guardar receta"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
