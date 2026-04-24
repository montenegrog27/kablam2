"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function ProductIngredientsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productIngredients, setProductIngredients] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
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

    const { data: ings } = await supabase
      .from("ingredients")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    setIngredients(ings || []);

    await loadProducts(userRecord.tenant_id, "");
    setLoading(false);
  };

  const loadProducts = async (tid: string, query: string) => {
    let q = supabase
      .from("products")
      .select("id, name, image_url, product_variants(name, price)")
      .eq("tenant_id", tid)
      .order("name")
      .limit(50);

    if (query) {
      q = q.ilike("name", `%${query}%`);
    }

    const { data: prods } = await q;

    const prodsWithPrice = (prods || []).map((p: any) => ({
      ...p,
      price: p.product_variants?.[0]?.price || 0,
    }));

    setProducts(prodsWithPrice);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    if (tenantId) {
      loadProducts(tenantId, value);
    }
  };

  const loadProductIngredients = async (prod: any) => {
    setSelectedProduct(prod);

    const { data: assigned } = await supabase
      .from("product_ingredients_display")
      .select("*, ingredients(*)")
      .eq("product_id", prod.id);

    setProductIngredients(assigned || []);
  };

  const handleAddIngredient = async (ingredientId: string) => {
    if (!selectedProduct) return;

    const exists = productIngredients.find(
      (pi) => pi.ingredient_id === ingredientId,
    );
    if (exists) return;

    const { data } = await supabase
      .from("product_ingredients_display")
      .insert({
        product_id: selectedProduct.id,
        ingredient_id: ingredientId,
        is_essential: false,
        is_visible: true,
      })
      .select()
      .single();

    if (data) {
      const ing = ingredients.find((i) => i.id === ingredientId);
      setProductIngredients([
        ...productIngredients,
        { ...data, ingredients: ing },
      ]);
    }
  };

  const handleRemoveIngredient = async (id: string) => {
    await supabase.from("product_ingredients_display").delete().eq("id", id);
    setProductIngredients(productIngredients.filter((pi) => pi.id !== id));
  };

  const handleToggleEssential = async (id: string, current: boolean) => {
    await supabase
      .from("product_ingredients_display")
      .update({ is_essential: !current })
      .eq("id", id);

    setProductIngredients(
      productIngredients.map((pi) =>
        pi.id === id ? { ...pi, is_essential: !current } : pi,
      ),
    );
  };

  const handleToggleVisible = async (id: string, current: boolean) => {
    await supabase
      .from("product_ingredients_display")
      .update({ is_visible: !current })
      .eq("id", id);

    setProductIngredients(
      productIngredients.map((pi) =>
        pi.id === id ? { ...pi, is_visible: !current } : pi,
      ),
    );
  };

  const unassignedIngredients = ingredients.filter(
    (ing) => !productIngredients.find((pi) => pi.ingredient_id === ing.id),
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-gray-400">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Ingredientes por Producto</h1>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="border p-3 w-full rounded-lg bg-white text-black"
        />
      </div>

      <div className="flex gap-6">
        {/* Product list - left side */}
        <div className="flex-1">
          <h3 className="font-semibold mb-3 text-gray-400">
            Seleccioná un producto ({products.length})
          </h3>

          {products.length === 0 ? (
            <div className="bg-gray-800 p-8 rounded-lg text-center text-gray-500">
              No hay productos que coincidan con la búsqueda
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products.map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => loadProductIngredients(prod)}
                  className={`p-4 rounded-lg border text-left transition ${
                    selectedProduct?.id === prod.id
                      ? "border-blue-500 bg-blue-500/20"
                      : "border-gray-700 hover:border-gray-500 bg-gray-800"
                  }`}
                >
                  <div className="font-medium text-white">{prod.name}</div>
                  <div className="text-sm text-gray-400">${prod.price}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right side - ingredients config */}
        <div className="w-96">
          {selectedProduct ? (
            <div className="bg-gray-800 p-5 rounded-lg sticky top-6">
              <h2 className="text-lg font-bold mb-4 text-white">
                {selectedProduct.name}
              </h2>

              {/* Assigned ingredients */}
              <div className="mb-6">
                <h3 className="font-semibold mb-3 text-gray-400 text-sm">
                  Ingredientes asignados
                </h3>

                {productIngredients.length === 0 && (
                  <p className="text-gray-500 text-sm py-4 text-center bg-gray-900 rounded">
                    Sin ingredientes asignados
                  </p>
                )}

                <div className="space-y-2">
                  {productIngredients.map((pi) => (
                    <div
                      key={pi.id}
                      className="bg-gray-900 p-3 rounded flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-white">
                          {pi.ingredients?.name}
                        </span>
                        {pi.is_essential && (
                          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                            Esencial
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            handleToggleEssential(pi.id, pi.is_essential)
                          }
                          title="Esencial"
                          className={`p-1.5 rounded text-xs ${
                            pi.is_essential
                              ? "bg-red-500/20 text-red-400"
                              : "bg-gray-700 text-gray-500"
                          }`}
                        >
                          ⛔
                        </button>

                        <button
                          onClick={() =>
                            handleToggleVisible(pi.id, pi.is_visible)
                          }
                          title="Visible"
                          className={`p-1.5 rounded text-xs ${
                            pi.is_visible
                              ? "bg-green-500/20 text-green-400"
                              : "bg-gray-700 text-gray-500"
                          }`}
                        >
                          👁
                        </button>

                        <button
                          onClick={() => handleRemoveIngredient(pi.id)}
                          className="p-1.5 rounded bg-gray-700 text-gray-400 hover:text-red-400"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add ingredients */}
              <div>
                <h3 className="font-semibold mb-3 text-gray-400 text-sm">
                  Agregar ingrediente ({unassignedIngredients.length})
                </h3>

                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {unassignedIngredients.map((ing) => (
                    <button
                      key={ing.id}
                      onClick={() => handleAddIngredient(ing.id)}
                      className="w-full bg-gray-900 p-2 rounded flex justify-between items-center hover:bg-gray-700 transition text-left"
                    >
                      <span className="text-gray-300">{ing.name}</span>
                      <span className="text-green-400 text-sm">+</span>
                    </button>
                  ))}

                  {unassignedIngredients.length === 0 && (
                    <p className="text-gray-500 text-sm py-4 text-center">
                      Todos los ingredientes están asignados
                    </p>
                  )}
                </div>
              </div>

              {/* Legend */}
              <div className="mt-4 pt-4 border-t border-gray-700 flex gap-4 text-xs text-gray-500">
                <span>⛔ Esencial = No se puede quitar</span>
                <span>👁 Visible en pedido</span>
              </div>
            </div>
          ) : (
            <div className="bg-gray-800 p-8 rounded-lg text-center text-gray-500 sticky top-6">
              <div className="text-4xl mb-3">👈</div>
              <p>Seleccioná un producto para configurar sus ingredientes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
