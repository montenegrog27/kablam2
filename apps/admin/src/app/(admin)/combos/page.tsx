"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function CombosPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [combos, setCombos] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCombo, setEditingCombo] = useState<any>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, number>
  >({});

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
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);
    setBranchId(userRecord.branch_id);

    // Cargar combos básicos
    const { data: combosData, error: combosError } = await supabase
      .from("combos")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    if (combosError) {
      console.error("Error loading combos:", combosError);
    }

    // Cargar combo_products para cada combo
    if (combosData && combosData.length > 0) {
      const combosWithProducts = await Promise.all(
        combosData.map(async (combo: any) => {
          const { data: cp } = await supabase
            .from("combo_products")
            .select("*, products(*, product_variants(*))")
            .eq("combo_id", combo.id);
          return { ...combo, combo_products: cp || [] };
        }),
      );
      setCombos(combosWithProducts);
    } else {
      setCombos([]);
    }

    // Cargar productos para el selector

    const { data: prods } = await supabase
      .from("products")
      .select("id, name, product_variants(id, name, price)")
      .eq("tenant_id", userRecord.tenant_id)
      .eq("is_active", true)
      .order("name");

    setProducts(prods || []);

    const { data: cats } = await supabase
      .from("categories")
      .select("id, name")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    setCategories(cats || []);
    setLoading(false);
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setCategoryId("");
    setSelectedProducts({});
    setEditingCombo(null);
    setShowForm(false);
  };

  const startEdit = (combo: any) => {
    setName(combo.name);
    setDescription(combo.description || "");
    setPrice(String(combo.price));
    setCategoryId(combo.category_id || "");
    const sel: Record<string, number> = {};
    combo.combo_products?.forEach((cp: any) => {
      sel[cp.product_id] = cp.quantity;
    });
    setSelectedProducts(sel);
    setEditingCombo(combo);
    setShowForm(true);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !branchId || !name || !price) {
      alert("Completá nombre y precio");
      return;
    }

    const productEntries = Object.entries(selectedProducts).filter(
      ([, qty]) => qty > 0,
    );
    if (productEntries.length === 0) {
      alert("Seleccioná al menos un producto");
      return;
    }

    if (editingCombo) {
      const { error } = await supabase
        .from("combos")
        .update({
          name,
          description,
          price: Number(price),
          category_id: categoryId || null,
        })
        .eq("id", editingCombo.id);

      if (error) {
        alert(error.message);
        return;
      }

      await supabase
        .from("combo_products")
        .delete()
        .eq("combo_id", editingCombo.id);
      await supabase.from("combo_products").insert(
        productEntries.map(([productId, quantity]) => ({
          combo_id: editingCombo.id,
          product_id: productId,
          quantity,
        })),
      );
    } else {
      const { data: newCombo, error } = await supabase
        .from("combos")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          category_id: categoryId || null,
          name,
          description,
          price: Number(price),
        })
        .select()
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      await supabase.from("combo_products").insert(
        productEntries.map(([productId, quantity]) => ({
          combo_id: newCombo.id,
          product_id: productId,
          quantity,
        })),
      );
    }

    resetForm();
    loadData();
  };

  const handleToggleActive = async (combo: any) => {
    await supabase
      .from("combos")
      .update({ is_active: !combo.is_active })
      .eq("id", combo.id);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este combo?")) return;
    await supabase.from("combos").delete().eq("id", id);
    loadData();
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) => {
      if (prev[productId]) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: 1 };
    });
  };

  const setProductQty = (productId: string, qty: number) => {
    setSelectedProducts((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: qty };
    });
  };

  const sumProductsCost = (combo: any) => {
    return (
      combo.combo_products?.reduce((acc: number, cp: any) => {
        const productCost = cp.products?.product_variants?.[0]?.cost || 0;
        return acc + productCost * cp.quantity;
      }, 0) || 0
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Combos</h1>
          <p className="text-gray-400 text-sm mt-1">
            Creá combos de productos con precio especial
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors text-sm"
        >
          {showForm ? "Cancelar" : "Nuevo combo"}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 p-6 rounded-lg mb-8 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre</label>
              <input
                className="w-full border border-gray-700 bg-gray-800 rounded px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Combo Hamburguesa Completa"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Precio de venta ($)
              </label>
              <input
                type="number"
                className="w-full border border-gray-700 bg-gray-800 rounded px-3 py-2 text-sm"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Descripción
            </label>
            <input
              className="w-full border border-gray-700 bg-gray-800 rounded px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción opcional"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Categoría del menú
            </label>
            <select
              className="w-full border border-gray-700 bg-gray-800 rounded px-3 py-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
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
            <label className="block text-xs text-gray-400 mb-2">
              Productos del combo
            </label>
            <div className="max-h-48 overflow-y-auto bg-gray-800 rounded border border-gray-700 p-2 space-y-1">
              {products.map((p) => {
                const qty = selectedProducts[p.id] || 0;
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!selectedProducts[p.id]}
                      onChange={() => toggleProduct(p.id)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-200 flex-1">
                      {p.name}
                    </span>
                    <span className="text-xs text-gray-500 mr-2">
                      ${Number(p.product_variants?.[0]?.price) || 0}
                    </span>
                    {qty > 0 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setProductQty(p.id, qty - 1);
                          }}
                          className="w-5 h-5 flex items-center justify-center bg-gray-700 rounded text-xs text-gray-300 hover:bg-gray-600"
                        >
                          -
                        </button>
                        <span className="text-xs text-gray-300 w-5 text-center">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setProductQty(p.id, qty + 1);
                          }}
                          className="w-5 h-5 flex items-center justify-center bg-gray-700 rounded text-xs text-gray-300 hover:bg-gray-600"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </label>
                );
              })}
              {products.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-2">
                  No hay productos
                </p>
              )}
            </div>
          </div>

          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">
            {editingCombo ? "Guardar cambios" : "Crear combo"}
          </button>
        </form>
      )}

      {/* Lista de combos */}
      <div className="grid gap-4 md:grid-cols-2">
        {combos.map((combo) => {
          const totalCost = sumProductsCost(combo);
          const margin =
            combo.price > 0
              ? ((combo.price - totalCost) / combo.price) * 100
              : 0;

          return (
            <div
              key={combo.id}
              className={`bg-gray-800 rounded-lg p-5 ${!combo.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white text-lg">
                    {combo.name}
                  </h3>
                  {combo.description && (
                    <p className="text-gray-400 text-sm mt-0.5">
                      {combo.description}
                    </p>
                  )}
                  {combo.categories?.name && (
                    <span className="inline-block mt-1 text-xs bg-blue-900 text-blue-200 px-2 py-0.5 rounded">
                      {combo.categories.name}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-white">
                    ${Number(combo.price)}
                  </div>
                  <div className="text-xs text-gray-400">
                    Costo: ${totalCost.toFixed(2)}
                    {combo.price > 0 && (
                      <span
                        className={`ml-1 ${margin >= 40 ? "text-green-400" : margin >= 20 ? "text-yellow-400" : "text-red-400"}`}
                      >
                        ({Math.round(margin)}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Productos del combo */}
              <div className="space-y-1.5 mb-4">
                {combo.combo_products?.map((cp: any) => (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between text-sm bg-gray-900 rounded px-3 py-1.5"
                  >
                    <span className="text-gray-300">
                      {cp.quantity}x {cp.products?.name}
                    </span>
                    <span className="text-gray-400">
                      $
                      {(cp.products?.product_variants?.[0]?.price || 0) *
                        cp.quantity}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 border-t border-gray-700 pt-3">
                <button
                  onClick={() => startEdit(combo)}
                  className="text-xs text-blue-400 underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleToggleActive(combo)}
                  className="text-xs underline"
                >
                  {combo.is_active ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => handleDelete(combo.id)}
                  className="text-xs text-red-400 underline"
                >
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}

        {combos.length === 0 && (
          <div className="col-span-2 text-center py-12 text-gray-500 bg-gray-800/50 rounded-lg">
            No hay combos configurados
          </div>
        )}
      </div>
    </div>
  );
}
