"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { ListMinus, Package, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";

type ItemType = "product" | "combo";

export default function ProductExtrasPage() {
  const [mode, setMode] = useState<ItemType>("product");
  const [products, setProducts] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [extras, setExtras] = useState<any[]>([]);
  const [removableIngredients, setRemovableIngredients] = useState<any[]>([]);
  const [newExtraIngredient, setNewExtraIngredient] = useState("");
  const [newRemovableIngredient, setNewRemovableIngredient] = useState("");
  const [selectedComboProductId, setSelectedComboProductId] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    setSelectedItem(null);
    setExtras([]);
    setRemovableIngredients([]);
    setNewExtraIngredient("");
    setNewRemovableIngredient("");
    setSelectedComboProductId("");
  }, [mode]);

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

    const [{ data: ings }, { data: prods }, { data: comboRows }] = await Promise.all([
      supabase
        .from("ingredients")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("name"),
      supabase
        .from("products")
        .select("id, name, image_url, product_variants(id, name, price, is_default, product_recipes(id, ingredient_id, ingredients(id, name)))")
        .eq("tenant_id", userRecord.tenant_id)
        .order("name")
        .limit(200),
      supabase
        .from("combos")
        .select("id, name, image_url, price, combo_products(id, product_id, quantity, products(id, name, product_variants(id, name, is_default, product_recipes(id, ingredient_id, ingredients(id, name))))))")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("is_active", true)
        .order("name")
        .limit(200),
    ]);

    setIngredients(ings || []);
    setProducts(
      (prods || []).map((product: any) => ({
        ...product,
        price: product.product_variants?.[0]?.price || 0,
      })),
    );
    setCombos(comboRows || []);
    setLoading(false);
  };

  const visibleItems = useMemo(() => {
    const source = mode === "product" ? products : combos;
    const normalized = search.trim().toLowerCase();
    if (!normalized) return source;
    return source.filter((item) => item.name?.toLowerCase().includes(normalized));
  }, [combos, mode, products, search]);

  const tableName = mode === "product" ? "product_extras" : "combo_extras";
  const ownerColumn = mode === "product" ? "product_id" : "combo_id";

  const loadExtras = async (item: any) => {
    setSelectedItem(item);
    setSelectedComboProductId(item.combo_products?.[0]?.product_id || "");
    setNewExtraIngredient("");
    setNewRemovableIngredient("");

    const { data: extrasData } = await supabase
      .from(tableName)
      .select("*, ingredients(*)")
      .eq(ownerColumn, item.id)
      .eq("is_active", true);

    setExtras(extrasData || []);

    if (mode === "product") {
      const { data: removableData } = await supabase
        .from("product_ingredients_display")
        .select("*, ingredients(*)")
        .eq("product_id", item.id)
        .eq("is_visible", true)
        .eq("is_essential", false);

      setRemovableIngredients(removableData || []);
    } else {
      const { data: removableData } = await supabase
        .from("combo_removable_ingredients")
        .select("*, ingredients(*), products(id, name)")
        .eq("combo_id", item.id)
        .eq("is_active", true);

      setRemovableIngredients(removableData || []);
    }
  };

  const handleAddExtra = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedItem || !newExtraIngredient) {
      alert("Seleccioná un ingrediente");
      return;
    }

    const exists = extras.find((extra) => extra.ingredient_id === newExtraIngredient);
    if (exists) {
      alert("Este ingrediente ya está agregado como extra");
      return;
    }

    const { error } = await supabase.from(tableName).upsert(
      {
        [ownerColumn]: selectedItem.id,
        ingredient_id: newExtraIngredient,
        is_active: true,
      },
      { onConflict: `${ownerColumn},ingredient_id` },
    );

    if (error) {
      alert(error.message);
      return;
    }

    setNewExtraIngredient("");
    loadExtras(selectedItem);
  };

  const handleDeleteExtra = async (id: string) => {
    if (!confirm("¿Eliminar este extra?")) return;
    await supabase.from(tableName).update({ is_active: false }).eq("id", id);
    loadExtras(selectedItem);
  };

  const getSelectedComboProduct = () =>
    selectedItem?.combo_products?.find((item: any) => item.product_id === selectedComboProductId);

  const getRecipeIngredients = (product: any) => {
    const rows = (product?.product_variants || []).flatMap(
      (variant: any) => variant.product_recipes || [],
    );
    const byId = new Map<string, any>();

    rows.forEach((row: any) => {
      const ingredient = row.ingredients;
      if (ingredient?.id && !byId.has(ingredient.id)) {
        byId.set(ingredient.id, ingredient);
      }
    });

    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
  };

  const getRemovableIngredientSource = () => {
    if (mode === "product") return getRecipeIngredients(selectedItem);
    const comboProduct = getSelectedComboProduct();
    return getRecipeIngredients(comboProduct?.products);
  };

  const handleAddRemovable = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedItem || !newRemovableIngredient) {
      alert("SeleccionÃ¡ un ingrediente");
      return;
    }

    if (mode === "product") {
      const existing = removableIngredients.find(
        (item) => item.ingredient_id === newRemovableIngredient,
      );
      if (existing) {
        alert("Este ingrediente ya se puede quitar");
        return;
      }

      const { data: existingRows } = await supabase
        .from("product_ingredients_display")
        .select("id")
        .eq("product_id", selectedItem.id)
        .eq("ingredient_id", newRemovableIngredient)
        .limit(1);

      const existingRow = existingRows?.[0];
      const { error } = existingRow
        ? await supabase
            .from("product_ingredients_display")
            .update({ is_visible: true, is_essential: false })
            .eq("id", existingRow.id)
        : await supabase.from("product_ingredients_display").insert({
            product_id: selectedItem.id,
            ingredient_id: newRemovableIngredient,
            is_visible: true,
            is_essential: false,
          });

      if (error) {
        alert(error.message);
        return;
      }
    } else {
      if (!selectedComboProductId) {
        alert("SeleccionÃ¡ el producto del combo");
        return;
      }

      const exists = removableIngredients.find(
        (item) =>
          item.product_id === selectedComboProductId &&
          item.ingredient_id === newRemovableIngredient,
      );
      if (exists) {
        alert("Este ingrediente ya se puede quitar en ese producto");
        return;
      }

      const { error } = await supabase.from("combo_removable_ingredients").upsert(
        {
          combo_id: selectedItem.id,
          product_id: selectedComboProductId,
          ingredient_id: newRemovableIngredient,
          is_active: true,
        },
        { onConflict: "combo_id,product_id,ingredient_id" },
      );

      if (error) {
        alert(error.message);
        return;
      }
    }

    setNewRemovableIngredient("");
    loadExtras(selectedItem);
  };

  const handleDeleteRemovable = async (item: any) => {
    if (!confirm("Â¿Quitar esta opciÃ³n?")) return;

    if (mode === "product") {
      await supabase
        .from("product_ingredients_display")
        .update({ is_essential: true })
        .eq("id", item.id);
    } else {
      await supabase
        .from("combo_removable_ingredients")
        .update({ is_active: false })
        .eq("id", item.id);
    }

    loadExtras(selectedItem);
  };

  const unassignedIngredients = ingredients.filter(
    (ingredient) => !extras.find((extra) => extra.ingredient_id === ingredient.id),
  );
  const removableIngredientSource = getRemovableIngredientSource();
  const unassignedRemovableIngredients = removableIngredientSource.filter(
    (ingredient: any) =>
      !removableIngredients.find(
        (item) =>
          item.ingredient_id === ingredient.id &&
          (mode === "product" || item.product_id === selectedComboProductId),
      ),
  );

  if (loading) {
    return <div className="p-6 text-gray-400">Cargando...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Extras por Producto y Combo</h1>
        <p className="mt-1 text-sm text-gray-400">
          Agregá ingredientes como extras elegibles. El precio se toma del ingrediente.
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-xl border border-gray-700 bg-gray-900 p-1">
          <button
            onClick={() => setMode("product")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
              mode === "product" ? "bg-white text-gray-950" : "text-gray-400 hover:text-white"
            }`}
          >
            <Package size={16} /> Productos
          </button>
          <button
            onClick={() => setMode("combo")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
              mode === "combo" ? "bg-white text-gray-950" : "text-gray-400 hover:text-white"
            }`}
          >
            <ShoppingBag size={16} /> Combos
          </button>
        </div>

        <div className="relative min-w-0 lg:w-96">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder={`Buscar ${mode === "product" ? "producto" : "combo"}...`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-gray-500"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section>
          <h3 className="mb-3 font-semibold text-gray-400">
            Seleccioná {mode === "product" ? "un producto" : "un combo"} ({visibleItems.length})
          </h3>

          {visibleItems.length === 0 ? (
            <div className="rounded-lg bg-gray-800 p-8 text-center text-gray-400">
              No hay {mode === "product" ? "productos" : "combos"}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadExtras(item)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selectedItem?.id === item.id
                      ? "border-blue-500 bg-blue-500/20"
                      : "border-gray-700 bg-gray-800 hover:border-gray-500"
                  }`}
                >
                  <div className="font-semibold text-white">{item.name}</div>
                  <div className="mt-1 text-sm text-gray-400">
                    ${new Intl.NumberFormat("es-AR").format(Number(item.price || 0))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside>
          {selectedItem ? (
            <div className="sticky top-6 rounded-xl bg-gray-800 p-5">
              <h2 className="text-lg font-bold text-white">
                {selectedItem.name}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Extras para {mode === "product" ? "producto" : "combo"}
              </p>

              <form onSubmit={handleAddExtra} className="mt-5 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Ingrediente</span>
                  <select
                    value={newExtraIngredient}
                    onChange={(event) => setNewExtraIngredient(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                  >
                    <option value="">Elegir ingrediente...</option>
                    {unassignedIngredients.map((ingredient) => (
                      <option key={ingredient.id} value={ingredient.id}>
                        {ingredient.name} → ${ingredient.sale_price || ingredient.cost_per_unit}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Plus size={16} /> Agregar extra
                </button>
              </form>

              <div className="mt-6">
                <h3 className="mb-3 text-sm font-semibold text-gray-400">
                  Extras configurados ({extras.length})
                </h3>

                {extras.length === 0 ? (
                  <p className="rounded-lg bg-gray-900 py-5 text-center text-sm text-gray-400">
                    No hay extras configurados
                  </p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {extras.map((extra) => (
                      <div key={extra.id} className="flex items-center justify-between rounded-lg bg-gray-900 p-3">
                        <div>
                          <span className="font-medium text-white">{extra.ingredients?.name}</span>
                          <div className="mt-1 text-sm font-semibold text-green-400">
                            ${extra.ingredients?.sale_price || extra.ingredients?.cost_per_unit}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteExtra(extra.id)}
                          className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 border-t border-gray-700 pt-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-200">
                  <ListMinus size={16} /> Ingredientes que puede quitar
                </h3>
                <p className="text-xs leading-5 text-gray-400">
                  {mode === "product"
                    ? "Estos ingredientes se mostraran como opcion 'Sin ...' en customer."
                    : "ElegÃ­ el producto interno del combo y que ingredientes se pueden quitar."}
                </p>

                <form onSubmit={handleAddRemovable} className="mt-4 space-y-3">
                  {mode === "combo" && (
                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-400">
                        Producto del combo
                      </span>
                      <select
                        value={selectedComboProductId}
                        onChange={(event) => {
                          setSelectedComboProductId(event.target.value);
                          setNewRemovableIngredient("");
                        }}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                      >
                        <option value="">Elegir producto...</option>
                        {(selectedItem.combo_products || []).map((comboProduct: any) => (
                          <option key={comboProduct.id} value={comboProduct.product_id}>
                            {comboProduct.quantity}x {comboProduct.products?.name || "Producto"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="block">
                    <span className="mb-1 block text-xs text-gray-400">
                      Ingrediente de la receta
                    </span>
                    <select
                      value={newRemovableIngredient}
                      onChange={(event) => setNewRemovableIngredient(event.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                    >
                      <option value="">Elegir ingrediente...</option>
                      {unassignedRemovableIngredients.map((ingredient: any) => (
                        <option key={ingredient.id} value={ingredient.id}>
                          {ingredient.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {removableIngredientSource.length === 0 && (
                    <p className="rounded-lg bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-yellow-200">
                      Este {mode === "product" ? "producto" : "producto del combo"} no tiene ingredientes cargados en receta.
                    </p>
                  )}

                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600"
                  >
                    <Plus size={16} /> Permitir quitar
                  </button>
                </form>

                <div className="mt-4">
                  {removableIngredients.length === 0 ? (
                    <p className="rounded-lg bg-gray-900 py-5 text-center text-sm text-gray-400">
                      No hay ingredientes quitables configurados
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {removableIngredients.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg bg-gray-900 p-3"
                        >
                          <div>
                            <span className="font-medium text-white">
                              Sin {item.ingredients?.name}
                            </span>
                            {mode === "combo" && (
                              <div className="mt-1 text-xs text-gray-400">
                                {item.products?.name || "Producto del combo"}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteRemovable(item)}
                            className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-gray-700 pt-4 text-xs leading-5 text-gray-400">
                El precio visible en customer sale de <strong>Precio venta</strong> del ingrediente.
              </div>
            </div>
          ) : (
            <div className="sticky top-6 rounded-xl bg-gray-800 p-8 text-center text-gray-400">
              Seleccioná {mode === "product" ? "un producto" : "un combo"} para configurar extras.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
