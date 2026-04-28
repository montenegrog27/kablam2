"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export const dynamic = "force-dynamic";

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  active: boolean;
  available_in: string[];
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [active, setActive] = useState(true);
  const [availableIn, setAvailableIn] = useState<string[]>([]);

  useEffect(() => {
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

      setTenantId(userRecord.tenant_id);
      await fetchCategories(userRecord.tenant_id);
    }

    loadData();
  }, []);

  const fetchCategories = async (tenantId: string) => {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("position");

    setCategories(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !name) return;

    const { error } = await supabase.from("categories").insert({
      tenant_id: tenantId,
      name,
      parent_id: parentId,
      position,
      active,
      available_in: availableIn,
    });

    if (error) {
      console.error("Error:", error);
      return;
    }

    setName("");
    setParentId(null);
    setPosition(0);
    setActive(true);
    setAvailableIn([]);

    await fetchCategories(tenantId);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;

    await supabase
      .from("categories")
      .update({
        name,
        parent_id: parentId,
        position,
        active,
        available_in: availableIn,
      })
      .eq("id", selectedCategory.id);

    if (tenantId) await fetchCategories(tenantId);
    setSelectedCategory(null);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta categoría?")) return;
    if (!tenantId) return;

    await supabase.from("categories").delete().eq("id", id);
    await fetchCategories(tenantId);
    if (selectedCategory?.id === id) {
      setSelectedCategory(null);
      resetForm();
    }
  };

  const handleEdit = (cat: Category) => {
    setSelectedCategory(cat);
    setName(cat.name);
    setParentId(cat.parent_id);
    setPosition(cat.position);
    setActive(cat.active);
    setAvailableIn(cat.available_in || []);
  };

  const resetForm = () => {
    setName("");
    setParentId(null);
    setPosition(0);
    setActive(true);
    setAvailableIn([]);
  };

  const toggleSlot = (slot: string) => {
    if (availableIn.includes(slot)) {
      setAvailableIn(availableIn.filter((s) => s !== slot));
    } else {
      setAvailableIn([...availableIn, slot]);
    }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedCategories(newSet);
  };

  const rootCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId);

  const rootOptions = selectedCategory
    ? categories.filter((c) => c.id !== selectedCategory.id)
    : categories;

  const dayPartLabels: Record<string, string> = {
    breakfast: "Desayuno",
    lunch: "Almuerzo",
    snack: "Merienda",
    dinner: "Cena",
  };

  return (
    <div className="flex gap-6 p-6">
      <aside className="w-72">
        <h2 className="font-bold text-xl mb-4">Categorías</h2>
        <div className="space-y-2">
          {rootCategories.map((cat) => (
            <div key={cat.id}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleExpand(cat.id)}
                  className="text-sm w-6"
                >
                  {getSubcategories(cat.id).length > 0
                    ? expandedCategories.has(cat.id)
                      ? "▼"
                      : "▶"
                    : "·"}
                </button>
                <button
                  onClick={() => handleEdit(cat)}
                  className={`flex-1 text-left p-2 rounded ${
                    selectedCategory?.id === cat.id
                      ? "bg-black text-white"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  <span className="font-medium">{cat.name}</span>
                  {!cat.active && (
                    <span className="text-xs text-red-500 ml-2">
                      (Inactiva)
                    </span>
                  )}
                </button>
              </div>

              {expandedCategories.has(cat.id) &&
                getSubcategories(cat.id).map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 ml-6 mt-1"
                  >
                    <button
                      onClick={() => handleEdit(sub)}
                      className={`flex-1 text-left p-2 rounded text-sm ${
                        selectedCategory?.id === sub.id
                          ? "bg-black text-white"
                          : "bg-gray-50 hover:bg-gray-100 border"
                      }`}
                    >
                      {sub.name}
                      {!sub.active && (
                        <span className="text-xs text-red-500 ml-2">
                          (Inactiva)
                        </span>
                      )}
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1">
        <h1 className="text-2xl font-bold mb-6">
          {selectedCategory ? "Editar Categoría" : "Nueva Categoría"}
        </h1>

        <form
          onSubmit={selectedCategory ? handleUpdate : handleCreate}
          className="bg-gray-50 border p-6 rounded-lg shadow-sm space-y-4 max-w-lg"
        >
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              className="border p-2 w-full rounded"
              placeholder="Ej: Hamburguesas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Categoría padre (subcategoría)
            </label>
            <select
              className="border p-2 w-full rounded"
              value={parentId || ""}
              onChange={(e) => setParentId(e.target.value || null)}
            >
              <option value="">Categoría raíz</option>
              {rootOptions
                .filter((c) => !c.parent_id)
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Posición</label>
            <input
              type="number"
              className="border p-2 w-full rounded"
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Activa
          </label>

          <div>
            <p className="text-sm font-medium mb-2">Disponible en:</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(dayPartLabels).map(([slot, label]) => (
                <label key={slot} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={availableIn.includes(slot)}
                    onChange={() => toggleSlot(slot)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
            >
              {selectedCategory ? "Guardar Cambios" : "Crear Categoría"}
            </button>

            {selectedCategory && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedCategory.id)}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
