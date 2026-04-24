"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function ProductExtrasPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [extras, setExtras] = useState<any[]>([]);
  const [newExtraIngredient, setNewExtraIngredient] = useState("");
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

    // Cargar ingredientes
    const { data: ings } = await supabase
      .from("ingredients")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    setIngredients(ings || []);

    // Cargar productos
    let q = supabase
      .from("products")
      .select("id, name, image_url, product_variants(name, price)")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name")
      .limit(50);

    if (search) {
      q = q.ilike("name", `%${search}%`);
    }

    const { data: prods } = await q;
    const prodsWithPrice = (prods || []).map((p: any) => ({
      ...p,
      price: p.product_variants?.[0]?.price || 0,
    }));
    setProducts(prodsWithPrice);

    setLoading(false);
  };

  const loadExtras = async (prod: any) => {
    setSelectedProduct(prod);

    const { data: extrasData } = await supabase
      .from("product_extras")
      .select("*, ingredients(*)")
      .eq("product_id", prod.id)
      .eq("is_active", true);

    setExtras(extrasData || []);
  };

  const handleAddExtra = async (e: any) => {
    e.preventDefault();

    if (!selectedProduct || !newExtraIngredient) {
      alert("Seleccioná un ingrediente");
      return;
    }

    // Verificar si ya existe
    const exists = extras.find((ex) => ex.ingredient_id === newExtraIngredient);
    if (exists) {
      alert("Este ingrediente ya está agregado como extra");
      return;
    }

    const { error } = await supabase.from("product_extras").insert({
      product_id: selectedProduct.id,
      ingredient_id: newExtraIngredient,
      is_active: true,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setNewExtraIngredient("");
    loadExtras(selectedProduct);
  };

  const handleDeleteExtra = async (id: string) => {
    if (!confirm("¿Eliminar este extra?")) return;

    await supabase
      .from("product_extras")
      .update({ is_active: false })
      .eq("id", id);

    loadExtras(selectedProduct);
  };

  const unassignedIngredients = ingredients.filter(
    (ing) => !extras.find((ex) => ex.ingredient_id === ing.id),
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
      <h1 className="text-2xl font-bold mb-2">Extras por Producto</h1>
      <p className="text-gray-400 mb-6">
        Agregá ingredientes como extras que el cliente puede elegir. El precio
        se toma del ingrediente.
      </p>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            loadInitialData();
          }}
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
              No hay productos
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products.map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => loadExtras(prod)}
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

        {/* Right side - extras config */}
        <div className="w-96">
          {selectedProduct ? (
            <div className="bg-gray-800 p-5 rounded-lg sticky top-6">
              <h2 className="text-lg font-bold mb-4 text-white">
                {selectedProduct.name} - Extras
              </h2>

              {/* Add extra form */}
              <form onSubmit={handleAddExtra} className="mb-6">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Seleccionar ingrediente
                  </label>
                  <select
                    value={newExtraIngredient}
                    onChange={(e) => setNewExtraIngredient(e.target.value)}
                    className="w-full border p-2 rounded bg-gray-900 text-white"
                  >
                    <option value="">Elegir ingrediente...</option>
                    {unassignedIngredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} → ${ing.sale_price || ing.cost_per_unit}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  Agregar Extra
                </button>
              </form>

              {/* Extras list */}
              <div>
                <h3 className="font-semibold mb-3 text-gray-400 text-sm">
                  Extras configurados ({extras.length})
                </h3>

                {extras.length === 0 && (
                  <p className="text-gray-500 text-sm py-4 text-center bg-gray-900 rounded">
                    No hay extras configurados
                  </p>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {extras.map((extra) => (
                    <div
                      key={extra.id}
                      className="bg-gray-900 p-3 rounded flex justify-between items-center"
                    >
                      <div>
                        <span className="text-white font-medium">
                          {extra.ingredients?.name}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-green-400 font-semibold">
                            $
                            {extra.ingredients?.sale_price ||
                              extra.ingredients?.cost_per_unit}
                          </span>
                          {extra.ingredients?.sale_price && (
                            <span className="text-xs text-gray-500">
                              (costo: ${extra.ingredients?.cost_per_unit})
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteExtra(extra.id)}
                        className="text-red-400 hover:text-red-300 p-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500">
                <p>
                  El precio se toma del campo <strong>"Precio venta"</strong>{" "}
                  del ingrediente.
                </p>
                <p className="mt-1">
                  Editá el ingrediente para cambiar el precio.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-800 p-8 rounded-lg text-center text-gray-500 sticky top-6">
              <div className="text-4xl mb-3">👈</div>
              <p>Seleccioná un producto para configurar sus extras</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
