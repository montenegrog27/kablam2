"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function UpsellsPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [upsells, setUpsells] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [suggestedCategoryId, setSuggestedCategoryId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [suggestionMode, setSuggestionMode] = useState<"category" | "products">(
    "category",
  );
  const [discount, setDiscount] = useState("0");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);

    const { data: cats } = await supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    setCategories(cats || []);

    // Obtener productos de esta sucursal
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("tenant_id", userRecord.tenant_id)
      .limit(1)
      .single();

    if (branch) {
      setBranchId(branch.id);
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, category_id")
        .eq("branch_id", branch.id)
        .eq("is_active", true)
        .order("name");

      setProducts(prods || []);
    }

    const { data: rules } = await supabase
      .from("upsell_rules")
      .select(
        `
        id,
        tenant_id,
        category_id,
        suggested_category_id,
        suggested_product_ids,
        discount,
        is_active,
        display_order,
        category:categories!upsell_rules_category_id_fkey(name),
        suggested_category:categories!upsell_rules_suggested_category_id_fkey(name)
      `,
      )
      .eq("tenant_id", userRecord.tenant_id)
      .order("display_order");

    setUpsells(rules || []);
    setLoading(false);
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();

    if (!tenantId || !selectedCategoryId) {
      alert("Seleccioná la categoría que dispara la regla");
      return;
    }

    if (suggestionMode === "category" && !suggestedCategoryId) {
      alert("Seleccioná una categoría sugerida");
      return;
    }

    if (suggestionMode === "products" && selectedProductIds.length === 0) {
      alert("Seleccioná al menos un producto para sugerir");
      return;
    }

    if (suggestionMode === "category") {
      const { error } = await supabase.from("upsell_rules").insert({
        tenant_id: tenantId,
        category_id: selectedCategoryId,
        suggested_category_id: suggestedCategoryId,
        discount: Number(discount) || 0,
        is_active: true,
      });

      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("upsell_rules").insert({
        tenant_id: tenantId,
        category_id: selectedCategoryId,
        suggested_product_ids: selectedProductIds,
        discount: Number(discount) || 0,
        is_active: true,
      });

      if (error) {
        alert(error.message);
        return;
      }
    }

    setSelectedCategoryId("");
    setSuggestedCategoryId("");
    setSelectedProductIds([]);
    setDiscount("0");
    setSuggestionMode("category");
    loadData();
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    await supabase
      .from("upsell_rules")
      .update({ is_active: !current })
      .eq("id", id);

    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta regla?")) return;

    await supabase.from("upsell_rules").delete().eq("id", id);
    loadData();
  };

  const handleEditProductSelection = async (rule: any) => {
    const productIdsStr = prompt(
      "IDs de productos separados por coma (vacio = usar categoría):",
      rule.suggested_product_ids?.join(", ") || "",
    );
    if (productIdsStr === null) return;

    const productIds = productIdsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const update: any = {};
    if (productIds.length > 0) {
      update.suggested_product_ids = productIds;
      update.suggested_category_id = null;
    } else {
      update.suggested_product_ids = null;
    }

    await supabase.from("upsell_rules").update(update).eq("id", rule.id);
    loadData();
  };

  const getCategoryName = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    return cat?.name || id;
  };

  const getProductNames = (ids: string[]) => {
    return ids
      .map((id) => {
        const p = products.find((p) => p.id === id);
        return p?.name || id.slice(0, 8);
      })
      .join(", ");
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-gray-400">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Sugerencias (Upsell)</h1>
      <p className="text-gray-400 mb-6">
        Configurá qué productos sugerir cuando el cliente agrega cierta
        categoría al carrito. Podés sugerir productos específicos o una
        categoría entera.
      </p>

      {/* Form */}
      <form onSubmit={handleCreate} className="bg-gray-900 p-6 rounded-lg mb-8">
        {/* Fila 1: categoría que dispara */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">
            Cuando el carrito tiene productos de esta categoría...
          </label>
          <select
            className="w-full border p-2 rounded bg-gray-800"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
          >
            <option value="">Seleccionar categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Fila 2: modo de sugerencia */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">
            Tipo de sugerencia
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSuggestionMode("category")}
              className={`px-4 py-2 rounded text-sm ${
                suggestionMode === "category"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              Sugerir categoría
            </button>
            <button
              type="button"
              onClick={() => setSuggestionMode("products")}
              className={`px-4 py-2 rounded text-sm ${
                suggestionMode === "products"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              Sugerir productos específicos
            </button>
          </div>
        </div>

        {/* Fila 3a: sugerir categoría */}
        {suggestionMode === "category" && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Sugerir categoría...
              </label>
              <select
                className="w-full border p-2 rounded bg-gray-800"
                value={suggestedCategoryId}
                onChange={(e) => setSuggestedCategoryId(e.target.value)}
              >
                <option value="">Seleccionar categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Descuento (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-full border p-2 rounded bg-gray-800"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>

        {/* Fila 3b: seleccionar productos específicos */}
        {suggestionMode === "products" && (
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-2">
              Seleccionar productos a sugerir
            </label>
            <div className="max-h-48 overflow-y-auto bg-gray-800 rounded border border-gray-700 p-2 space-y-1">
              {products
                .filter((p) => p.category_id !== selectedCategoryId)
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-200">{p.name}</span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {getCategoryName(p.category_id)}
                    </span>
                  </label>
                ))}
              {products.filter((p) => p.category_id !== selectedCategoryId)
                .length === 0 && (
                <p className="text-gray-500 text-sm text-center py-2">
                  No hay productos disponibles
                </p>
              )}
            </div>
            <div className="mt-2">
              <label className="block text-xs text-gray-400 mb-1">
                Descuento (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-full border p-2 rounded bg-gray-800 max-w-[200px]"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>
        )}

        <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Agregar Regla
        </button>
      </form>

      {/* Rules list */}
      <div className="space-y-4">
        {upsells.map((rule) => {
          const hasSpecificProducts =
            rule.suggested_product_ids && rule.suggested_product_ids.length > 0;

          return (
            <div
              key={rule.id}
              className={`bg-gray-800 p-4 rounded-lg flex items-center justify-between ${
                !rule.is_active ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-1">
                    Cuando selecciona
                  </div>
                  <div className="font-semibold px-3 py-1 bg-gray-700 rounded">
                    {rule.category?.name || getCategoryName(rule.category_id)}
                  </div>
                </div>

                <div className="text-2xl text-gray-500">→</div>

                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-1">Sugerir</div>
                  {hasSpecificProducts ? (
                    <div className="font-semibold px-3 py-1 bg-purple-900/50 text-purple-400 rounded flex flex-col items-start gap-1">
                      <span className="text-xs text-purple-300">
                        Productos específicos:
                      </span>
                      <span className="text-sm">
                        {getProductNames(rule.suggested_product_ids)}
                      </span>
                      {rule.discount > 0 && (
                        <span className="bg-yellow-500 text-black text-xs px-2 py-0.5 rounded-full font-bold">
                          -{rule.discount}%
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="font-semibold px-3 py-1 bg-green-900/50 text-green-400 rounded flex items-center gap-2">
                      {rule.suggested_category?.name ||
                        getCategoryName(rule.suggested_category_id)}
                      {rule.discount > 0 && (
                        <span className="bg-yellow-500 text-black text-xs px-2 py-0.5 rounded-full font-bold">
                          -{rule.discount}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hasSpecificProducts && (
                  <button
                    onClick={() => handleEditProductSelection(rule)}
                    className="text-xs text-blue-400 underline"
                  >
                    Editar productos
                  </button>
                )}
                <button
                  onClick={() => handleToggleActive(rule.id, rule.is_active)}
                  className="text-xs underline"
                >
                  {rule.is_active ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="text-red-400 text-xs underline"
                >
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}

        {upsells.length === 0 && (
          <p className="text-gray-500 text-center py-8">
            No hay reglas de upsell configuradas
          </p>
        )}
      </div>
    </div>
  );
}
