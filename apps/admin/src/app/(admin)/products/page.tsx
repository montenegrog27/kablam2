"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function ProductsPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [kitchens, setKitchens] = useState<any[]>([]);
  const [kitchenProducts, setKitchenProducts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedDayParts, setSelectedDayParts] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [allowHalf, setAllowHalf] = useState(false);
  const [isSuggestable, setIsSuggestable] = useState(false);
  const [showInMenu, setShowInMenu] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isHero, setIsHero] = useState(false);
  const [isPreparable, setIsPreparable] = useState(true);
  const [hasRecipe, setHasRecipe] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dayParts, setDayParts] = useState<any[]>([]);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [productGroups, setProductGroups] = useState<Record<string, string[]>>(
    {},
  );
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingDayParts, setEditingDayParts] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      const { data: userData } = await supabase.auth.getUser();
      console.log("AUTH USER:", userData?.user);
      const user = userData?.user;
      if (!user) return;

      const { data: userRecord } = await supabase
        .from("users")
        .select("tenant_id, branch_id")
        .eq("id", user.id)
        .single();

      if (!userRecord) return;

      setTenantId(userRecord.tenant_id);
      setBranchId(userRecord.branch_id);

      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("position");

      setCategories(cats || []);
      const { data: parts } = await supabase
        .from("day_parts")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("position");

      setDayParts(parts || []);

      const { data: prods } = await supabase
        .from("products")
        .select(
          "*, product_variants(*, variant_types(*)), product_ingredients_display(*, ingredients(*)), product_extras(*, ingredients(*))",
        )
        .eq("tenant_id", userRecord.tenant_id);

      setProducts(prods || []);

      const { data: kitchensData } = await supabase
        .from("kitchens")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("branch_id", userRecord.branch_id);

      setKitchens(kitchensData || []);

      const { data: kitchenProductsData } = await supabase
        .from("kitchen_products")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id);

      setKitchenProducts(kitchenProductsData || []);
      const { data: groups } = await supabase
        .from("modifier_groups")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("position");

      setModifierGroups(groups || []);
      const { data: relations } = await supabase
        .from("modifier_group_products")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id);

      const map: Record<string, string[]> = {};

      relations?.forEach((r) => {
        if (!map[r.product_id]) {
          map[r.product_id] = [];
        }

        map[r.product_id].push(r.modifier_group_id);
      });

      setProductGroups(map);
    }

    loadData();
  }, []);

  const toggleDayPart = (id: string) => {
    if (selectedDayParts.includes(id)) {
      setSelectedDayParts(selectedDayParts.filter((d) => d !== id));
    } else {
      setSelectedDayParts([...selectedDayParts, id]);
    }
  };

  const getProductKitchenOverride = (productId: string) => {
    const override = kitchenProducts.find((kp) => kp.product_id === productId);
    return override ? override.kitchen_id : "";
  };

  const handleKitchenChange = async (productId: string, kitchenId: string) => {
    const existing = kitchenProducts.find((kp) => kp.product_id === productId);

    if (kitchenId === "") {
      // Volver a seguir categoría
      if (existing) {
        await supabase.from("kitchen_products").delete().eq("id", existing.id);
      }
    } else {
      if (existing) {
        await supabase
          .from("kitchen_products")
          .update({ kitchen_id: kitchenId })
          .eq("id", existing.id);
      } else {
        await supabase.from("kitchen_products").insert({
          tenant_id: tenantId,
          product_id: productId,
          kitchen_id: kitchenId,
        });
      }
    }

    // recargar overrides
    const { data } = await supabase
      .from("kitchen_products")
      .select("*")
      .eq("tenant_id", tenantId);

    setKitchenProducts(data || []);
  };

  const handleCreateProduct = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !branchId || !categoryId || !price) {
      alert("Completa los campos obligatorios");
      return;
    }
    if (!hasRecipe && !cost) {
      alert("Cargá el costo manual para productos sin receta");
      return;
    }

    let imageUrl = null;
    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      await supabase.storage.from("product-images").upload(fileName, imageFile);
      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      imageUrl = data.publicUrl;
    }

    const { data: newProduct, error: productError } = await supabase
      .from("products")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        name,
        description,
        category_id: categoryId,
        allow_half: allowHalf,
        is_suggestable: isSuggestable,
        show_in_menu: showInMenu,
        is_featured: isFeatured,
        is_hero: isHero,
        is_preparable: isPreparable,
        has_recipe: hasRecipe,
      })
      .select()
      .single();

    if (productError || !newProduct) {
      alert(productError?.message || "Error");
      return;
    }

    await supabase.from("product_variants").insert({
      product_id: newProduct.id,
      tenant_id: tenantId,
      name: name,
      price: Number(price),
      cost: cost ? Number(cost) : null,
      image_url: imageUrl,
      is_default: true,
    });

    const relations = selectedDayParts.map((partId) => ({
      product_id: newProduct.id,
      tenant_id: tenantId,
      day_part_id: partId,
    }));

    const { error: dayPartError } = await supabase
      .from("product_day_parts")
      .insert(relations);

    console.log("DAY PART ERROR:", dayPartError);

    if (dayPartError) {
      alert("DAY PARTS FAIL");
      return;
    }

    setSelectedDayParts([]);
    setShowForm(false);
    setName("");
    setDescription("");
    setPrice("");
    setCost("");
    setAllowHalf(false);
    setIsPreparable(true);
    setHasRecipe(true);
    setImageFile(null);

    const { data: prods } = await supabase
      .from("products")
      .select("*, product_variants(*, variant_types(*))")
      .eq("tenant_id", tenantId);

    setProducts(prods || []);
  };

  const rootCategories = categories.filter((c) => !c.parent_id);

  const getProductsByCategory = () => {
    if (!selectedCategory) return products;

    const subCategories = categories
      .filter((c) => c.parent_id === selectedCategory)
      .map((c) => c.id);

    const allowedIds = [selectedCategory, ...subCategories];

    return products.filter((p) => allowedIds.includes(p.category_id));
  };

  const filteredProducts = getProductsByCategory();
  const toggleGroup = async (productId: string, groupId: string) => {
    const existing = productGroups[productId]?.includes(groupId);

    if (existing) {
      await supabase
        .from("modifier_group_products")
        .delete()
        .eq("product_id", productId)
        .eq("modifier_group_id", groupId);
    } else {
      await supabase.from("modifier_group_products").insert({
        tenant_id: tenantId,
        product_id: productId,
        modifier_group_id: groupId,
      });
    }

    // recargar relaciones

    const { data } = await supabase
      .from("modifier_group_products")
      .select("*")
      .eq("tenant_id", tenantId);

    const map: Record<string, string[]> = {};

    data?.forEach((r) => {
      if (!map[r.product_id]) {
        map[r.product_id] = [];
      }

      map[r.product_id].push(r.modifier_group_id);
    });

    setProductGroups(map);
  };

  const startEditProduct = async (product: any) => {
    setEditingProduct(product);
    setShowForm(false); // Ocultar formulario de creación si está abierto
    setImageFile(null); // Resetear imagen nueva

    // Cargar day parts del producto
    const { data: dayPartsData } = await supabase
      .from("product_day_parts")
      .select("day_part_id")
      .eq("product_id", product.id);

    const dayPartIds = dayPartsData?.map((d) => d.day_part_id) || [];
    setEditingDayParts(dayPartIds);

    // Pre-cargar los campos del formulario
    setName(product.name);
    setDescription(product.description || "");
    setCategoryId(product.category_id);
    setAllowHalf(product.allow_half);
    setShowInMenu(product.show_in_menu);
    setIsSuggestable(product.is_suggestable);
    setIsFeatured(product.is_featured);
    setIsHero(product.is_hero);
    setIsPreparable(product.is_preparable !== false);
    setHasRecipe(product.has_recipe !== false);

    // Obtener la variante principal (primera o default)
    const mainVariant = product.product_variants?.[0];
    if (mainVariant) {
      setPrice(mainVariant.price.toString());
      setCost(mainVariant.cost ? mainVariant.cost.toString() : "");
    }
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setEditingDayParts([]);
    setName("");
    setDescription("");
    setCategoryId(null);
    setHasRecipe(true);
  };

  const handleDeleteProduct = async (product: any) => {
    if (!confirm(`¿Eliminar "${product.name}" permanentemente?`)) return;
    const variantIds = (product.product_variants || []).map((v: any) => v.id);

    await supabase.from("order_item_modifiers").delete().in("variant_id", variantIds);
    await supabase.from("product_recipes").delete().in("variant_id", variantIds);
    await supabase.from("product_ingredients_display").delete().eq("product_id", product.id);
    await supabase.from("product_extras").delete().eq("product_id", product.id);
    await supabase.from("modifier_group_products").delete().eq("product_id", product.id);
    await supabase.from("product_day_parts").delete().eq("product_id", product.id);
    await supabase.from("kitchen_products").delete().eq("product_id", product.id);
    await supabase.from("product_variants").delete().eq("product_id", product.id);
    await supabase.from("order_items").delete().eq("product_id", product.id);
    await supabase.from("products").delete().eq("id", product.id);

    window.location.reload();
  };

  const updateProduct = async (e: any) => {
    e.preventDefault();
    if (
      !tenantId ||
      !branchId ||
      !categoryId ||
      !name ||
      !price ||
      !editingProduct
    ) {
      alert("Completa los campos obligatorios");
      return;
    }
    if (!hasRecipe && !cost) {
      alert("Cargá el costo manual para productos sin receta");
      return;
    }

    let imageUrl = editingProduct.product_variants?.[0]?.image_url || null;
    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      await supabase.storage.from("product-images").upload(fileName, imageFile);
      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      imageUrl = data.publicUrl;
    }

    // Actualizar producto
    const { error: productError } = await supabase
      .from("products")
      .update({
        name,
        description,
        category_id: categoryId,
        allow_half: allowHalf,
        is_suggestable: isSuggestable,
        show_in_menu: showInMenu,
        is_featured: isFeatured,
        is_hero: isHero,
        is_preparable: isPreparable,
        has_recipe: hasRecipe,
      })
      .eq("id", editingProduct.id);

    if (productError) {
      alert(productError.message);
      return;
    }

    // Actualizar variante principal
    const mainVariant = editingProduct.product_variants?.[0];
    if (mainVariant) {
      const { error: variantError } = await supabase
        .from("product_variants")
        .update({
          name,
          price: Number(price),
          cost: cost ? Number(cost) : null,
          image_url: imageUrl,
        })
        .eq("id", mainVariant.id);

      if (variantError) {
        alert(variantError.message);
        return;
      }

      if (!hasRecipe) {
        await Promise.all([
          supabase.from("product_recipes").delete().eq("variant_id", mainVariant.id),
          supabase.from("product_packaging").delete().eq("variant_id", mainVariant.id),
        ]);
      }
    }

    // Actualizar day parts
    // Primero eliminar existentes
    await supabase
      .from("product_day_parts")
      .delete()
      .eq("product_id", editingProduct.id);

    // Insertar nuevos
    if (editingDayParts.length > 0) {
      const relations = editingDayParts.map((partId) => ({
        product_id: editingProduct.id,
        tenant_id: tenantId,
        day_part_id: partId,
      }));

      const { error: dayPartError } = await supabase
        .from("product_day_parts")
        .insert(relations);

      if (dayPartError) {
        alert("Error actualizando turnos");
        return;
      }
    }

    // Recargar productos
    const { data: prods } = await supabase
      .from("products")
      .select("*, product_variants(*, variant_types(*))")
      .eq("tenant_id", tenantId);

    setProducts(prods || []);
    cancelEdit();
    alert("Producto actualizado correctamente");
  };

  return (
    <div className="flex gap-6">
      {/* Sidebar de categorías */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-800">Categorías</h2>
          <span className="text-xs bg-gray-200 text-gray-400 px-2 py-1 rounded-full">
            {filteredProducts.length} productos
          </span>
        </div>

        <nav className="space-y-1">
          <button
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !selectedCategory
                ? "bg-black text-white font-medium"
                : "text-gray-300 hover:bg-gray-800"
            }`}
            onClick={() => setSelectedCategory(null)}
          >
            Todas las categorías
          </button>

          {rootCategories.map((cat) => {
            const subCats = categories.filter(
              (sub) => sub.parent_id === cat.id,
            );
            const catProducts = products.filter(
              (p) => p.category_id === cat.id,
            ).length;

            return (
              <div key={cat.id} className="space-y-1">
                <button
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between items-center ${
                    selectedCategory === cat.id
                      ? "bg-black text-white font-medium"
                      : "text-gray-300 hover:bg-gray-800"
                  }`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <span>{cat.name}</span>
                  {catProducts > 0 && (
                    <span className="text-xs bg-gray-200 text-gray-400 px-2 py-0.5 rounded-full">
                      {catProducts}
                    </span>
                  )}
                </button>

                {subCats.map((sub) => {
                  const subProducts = products.filter(
                    (p) => p.category_id === sub.id,
                  ).length;

                  return (
                    <button
                      key={sub.id}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between items-center ml-4 ${
                        selectedCategory === sub.id
                          ? "bg-gray-800 text-white font-medium"
                          : "text-gray-400 hover:bg-gray-800"
                      }`}
                      onClick={() => setSelectedCategory(sub.id)}
                    >
                      <span>{sub.name}</span>
                      {subProducts > 0 && (
                        <span className="text-xs bg-gray-200 text-gray-400 px-2 py-0.5 rounded-full">
                          {subProducts}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Productos</h1>
            <p className="text-gray-400 text-sm mt-1">
              Gestioná los productos de tu menú
            </p>
          </div>
          <button
            className="bg-black hover:bg-gray-800 text-white font-medium px-4 py-3 rounded-lg transition-colors flex items-center gap-2"
            onClick={() => {
              setShowForm(!showForm);
              setEditingProduct(null);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 00-1 1v5H4a1 1 0 100 2h5v5a1 1 0 102 0v-5h5a1 1 0 100-2h-5V4a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Nuevo Producto
          </button>
        </div>

        {/* Formulario de creación */}
        {showForm && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-sm p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-100">
                Crear nuevo producto
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nombre del producto *
                  </label>
                  <input
                    className="w-full border border-gray-600 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                    placeholder="Ej: Hamburguesa Clásica"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Categoría *
                  </label>
                  <select
                    className="w-full border border-gray-600 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-white focus:border-black transition appearance-none bg-gray-900"
                    value={categoryId || ""}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                  >
                    <option value="">Seleccionar categoría</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Descripción
                </label>
                <textarea
                  className="w-full border border-gray-600 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                  placeholder="Describe tu producto..."
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Precio *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      className="w-full border border-gray-600 rounded-lg pl-8 pr-4 py-3 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {hasRecipe ? "Costo manual de respaldo" : "Costo manual *"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      className="w-full border border-gray-600 rounded-lg pl-8 pr-4 py-3 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                      placeholder="0.00"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {hasRecipe
                      ? "Si la receta no tiene costo, se usa este valor como respaldo."
                      : "Se usa directo para CMV, reportes, combos y promociones."}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Imagen del producto
                </label>
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="image-upload"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-10 w-10 text-gray-400 mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-sm text-gray-400">
                      {imageFile
                        ? imageFile.name
                        : "Hacé clic para subir una imagen"}
                    </span>
                    <span className="text-xs text-gray-400 mt-1">
                      PNG, JPG o WebP (max 5MB)
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-100 mb-3">
                    Configuración
                  </h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                        checked={allowHalf}
                        onChange={(e) => setAllowHalf(e.target.checked)}
                      />
                      <span className="text-sm text-gray-300">
                        Permite mitades (ej: pizzas)
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                        checked={showInMenu}
                        onChange={(e) => setShowInMenu(e.target.checked)}
                      />
                      <span className="text-sm text-gray-300">
                        Visible en menú
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                        checked={isSuggestable}
                        onChange={(e) => setIsSuggestable(e.target.checked)}
                      />
                      <span className="text-sm text-gray-300">
                        Solo en sugerencias
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                        checked={isFeatured}
                        onChange={(e) => setIsFeatured(e.target.checked)}
                      />
                      <span className="text-sm text-gray-300">
                        Destacado (ocupa más espacio)
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                        checked={isHero}
                        onChange={(e) => setIsHero(e.target.checked)}
                      />
                      <span className="text-sm text-gray-300">
                        Hero (portada de categoría)
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                        checked={isPreparable}
                        onChange={(e) => setIsPreparable(e.target.checked)}
                      />
                      <span className="text-sm text-gray-300">
                        Preparable (aparece en KDS)
                      </span>
                    </label>

                    <label className="flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-800/70 p-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                        checked={!hasRecipe}
                        onChange={(e) => setHasRecipe(!e.target.checked)}
                      />
                      <span className="text-sm text-gray-300">
                        <span className="block font-medium text-gray-100">Producto sin receta</span>
                        <span className="text-xs text-gray-500">
                          Para bebidas o reventa. Usa el costo manual y no calcula ingredientes.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-100 mb-3">
                    Turnos disponibles
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {dayParts.map((part) => (
                      <label
                        key={part.id}
                        className="flex items-center gap-2 bg-gray-800 p-3 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                          checked={selectedDayParts.includes(part.id)}
                          onChange={() => toggleDayPart(part.id)}
                        />
                        <span className="text-sm text-gray-300">
                          {part.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Crear Producto
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de productos */}
        {filteredProducts.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-gray-400 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-100 mb-2">
              No hay productos
            </h3>
            <p className="text-gray-400 mb-6">
              {selectedCategory
                ? "No hay productos en esta categoría"
                : "Comienza creando tu primer producto"}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-black hover:bg-gray-800 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Crear primer producto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className={`bg-gray-900 border border-gray-700 rounded-xl shadow-sm overflow-hidden ${
                  editingProduct?.id === product.id
                    ? "ring-2 ring-black"
                    : "hover:shadow-md transition-shadow"
                }`}
              >
                {editingProduct?.id === product.id ? (
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-semibold text-gray-100">
                        Editando producto
                      </h3>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>

                    <form onSubmit={updateProduct} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Nombre *
                        </label>
                        <input
                          className="w-full border border-gray-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                          placeholder="Nombre del producto"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Descripción
                        </label>
                        <textarea
                          className="w-full border border-gray-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                          placeholder="Descripción"
                          rows={2}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Precio *
                          </label>
                          <input
                            type="number"
                            className="w-full border border-gray-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                            placeholder="0"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            {hasRecipe ? "Costo manual de respaldo" : "Costo manual *"}
                          </label>
                          <input
                            type="number"
                            className="w-full border border-gray-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                            placeholder="0"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            {hasRecipe ? "Fallback si no hay costo de receta." : "Costo directo para CMV y reportes."}
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Imagen
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full border border-gray-600 rounded-lg px-4 py-2 text-sm"
                          onChange={(e) =>
                            setImageFile(e.target.files?.[0] || null)
                          }
                        />
                        {product.product_variants?.[0]?.image_url && (
                          <div className="mt-2 flex items-center gap-3">
                            <img
                              src={product.product_variants[0].image_url}
                              className="w-12 h-12 object-cover rounded"
                              alt="Imagen actual"
                            />
                            <span className="text-xs text-gray-400">
                              Imagen actual
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Categoría
                          </label>
                          <select
                            className="w-full border border-gray-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                            value={categoryId || ""}
                            onChange={(e) => setCategoryId(e.target.value)}
                          >
                            <option value="">Seleccionar categoría</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                            checked={allowHalf}
                            onChange={(e) => setAllowHalf(e.target.checked)}
                          />
                          <span className="text-sm text-gray-300">
                            Permite mitades
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                            checked={showInMenu}
                            onChange={(e) => setShowInMenu(e.target.checked)}
                          />
                          <span className="text-sm text-gray-300">
                            Visible en menú
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                            checked={isSuggestable}
                            onChange={(e) => setIsSuggestable(e.target.checked)}
                          />
                          <span className="text-sm text-gray-300">
                            Solo sugerencias
                          </span>
                        </div>
                        <label className="flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-800/70 p-3">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                            checked={!hasRecipe}
                            onChange={(e) => setHasRecipe(!e.target.checked)}
                          />
                          <span className="text-sm text-gray-300">
                            <span className="block font-medium text-gray-100">Producto sin receta</span>
                            <span className="text-xs text-gray-500">
                              Usa el costo manual. Ideal para bebidas o productos de reventa.
                            </span>
                          </span>
                        </label>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-lg transition-colors"
                        >
                          Guardar cambios
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <>
                    {/* Vista normal del producto */}
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-gray-100 text-lg">
                            {product.name}
                          </h3>
                          {product.description && (
                            <p className="text-gray-400 text-sm mt-1">
                              {product.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => startEditProduct(product)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="Editar producto"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Eliminar producto"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <span className="text-2xl font-bold text-gray-100">
                            ${product.product_variants?.[0]?.price || 0}
                          </span>
                          {product.product_variants?.[0]?.cost != null && (
                            <span className="text-sm ml-2">
                              <span className="text-gray-400">
                                Costo: $
                                {Number(
                                  product.product_variants[0].cost,
                                ).toFixed(2)}
                              </span>
                              {product.product_variants[0].price > 0 && (
                                <span
                                  className={`ml-2 font-medium ${
                                    ((product.product_variants[0].price -
                                      product.product_variants[0].cost) /
                                      product.product_variants[0].price) *
                                      100 >=
                                    40
                                      ? "text-green-600"
                                      : ((product.product_variants[0].price -
                                            product.product_variants[0].cost) /
                                            product.product_variants[0].price) *
                                            100 >=
                                          20
                                        ? "text-yellow-600"
                                        : "text-red-600"
                                  }`}
                                >
                                  (
                                  {Math.round(
                                    ((product.product_variants[0].price -
                                      product.product_variants[0].cost) /
                                      product.product_variants[0].price) *
                                      100,
                                  )}
                                  % margen)
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {!product.show_in_menu && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                              Solo sugerencias
                            </span>
                          )}
                          {product.is_featured && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                              Destacado
                            </span>
                          )}
                          {product.is_hero && (
                            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                              Hero
                            </span>
                          )}
                          {product.allow_half && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                              Mitades
                            </span>
                          )}
                        </div>
                      </div>

                      {product.product_variants?.[0]?.image_url && (
                        <div className="mb-4">
                          <img
                            src={product.product_variants[0].image_url}
                            alt={product.name}
                            className="w-full h-48 object-cover rounded-lg"
                          />
                        </div>
                      )}

                      <div className="text-sm">
                        <label className="text-gray-400 block mb-1">
                          Cocina asignada
                        </label>
                        <select
                          className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-white focus:border-black transition"
                          value={getProductKitchenOverride(product.id)}
                          onChange={(e) =>
                            handleKitchenChange(product.id, e.target.value)
                          }
                        >
                          <option value="">Seguir categoría</option>
                          {kitchens.map((kitchen) => (
                            <option key={kitchen.id} value={kitchen.id}>
                              {kitchen.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Receta e ingredientes unificados */}
                      {product.product_variants?.[0] && product.has_recipe !== false && (
                        <RecipeSection
                          variantId={product.product_variants[0].id}
                          productId={product.id}
                          tenantId={tenantId}
                        />
                      )}
                      {product.product_variants?.[0] && product.has_recipe === false && (
                        <div className="pt-4 border-t border-gray-700">
                          <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
                            Producto sin receta: usa costo manual de $
                            {Number(product.product_variants[0].cost || 0).toLocaleString("es-AR")} para reportes, combos y promociones.
                          </div>
                        </div>
                      )}

                      {/* Extras disponibles (modifier groups) */}
                      <div className="pt-4 border-t border-gray-700">
                        <h4 className="font-medium text-gray-100 mb-3 text-sm">
                          Extras disponibles
                        </h4>
                        {modifierGroups.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {modifierGroups.map((group) => (
                              <label
                                key={group.id}
                                className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-black rounded border-gray-600 focus:ring-white"
                                  checked={
                                    productGroups[product.id]?.includes(
                                      group.id,
                                    ) || false
                                  }
                                  onChange={() =>
                                    toggleGroup(product.id, group.id)
                                  }
                                />
                                <span className="text-sm text-gray-300">
                                  {group.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">
                            No hay grupos de extras configurados
                          </p>
                        )}
                      </div>

                      {/* Ingredientes display */}
                      {product.product_ingredients_display?.length > 0 && (
                        <div className="pt-4 border-t border-gray-700">
                          <h4 className="font-medium text-gray-100 mb-2 text-sm">
                            Ingredientes visibles en pedido
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {product.product_ingredients_display.map(
                              (pi: any) => (
                                <span
                                  key={pi.id}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                                    pi.is_essential
                                      ? "bg-red-50 text-red-700 border border-red-200"
                                      : "bg-gray-800 text-gray-400 border border-gray-700"
                                  }`}
                                >
                                  {pi.ingredients?.name}
                                  {pi.is_essential && (
                                    <span
                                      className="text-red-400"
                                      title="Esencial"
                                    >
                                      *
                                    </span>
                                  )}
                                  {!pi.is_visible && (
                                    <span
                                      className="text-gray-400"
                                      title="No visible"
                                    >
                                      👁‍🗨
                                    </span>
                                  )}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Componente de receta inline con ingredientes, cantidades y costo
function RecipeSection({
  variantId,
  productId,
  tenantId,
}: {
  variantId: string;
  productId: string;
  tenantId: string | null;
}) {
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState("");
  const [quantity, setQuantity] = useState("");

  useEffect(() => {
    if (!variantId || !tenantId) return;

    supabase
      .from("ingredients")
      .select("*")
      .eq("tenant_id", tenantId)
      .then(({ data }) => setIngredients(data || []));

    loadRecipe();
  }, [variantId, tenantId]);

  const loadRecipe = async () => {
    const { data: recipe } = await supabase
      .from("product_recipes")
      .select("*, ingredients(*)")
      .eq("variant_id", variantId);

    setRecipeItems(recipe || []);
    updateVariantCost(recipe || []);
  };

  const updateVariantCost = async (items: any[]) => {
    const total = items.reduce(
      (acc: number, item: any) =>
        acc + (item.ingredients?.cost_per_unit || 0) * item.quantity,
      0,
    );

    await supabase
      .from("product_variants")
      .update({ cost: total })
      .eq("id", variantId);
  };

  const handleAdd = async (e: any) => {
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

  const handleRemove = async (id: string) => {
    await supabase.from("product_recipes").delete().eq("id", id);
    await loadRecipe();
  };

  const totalCost = recipeItems.reduce(
    (acc: number, item: any) =>
      acc + (item.ingredients?.cost_per_unit || 0) * item.quantity,
    0,
  );

  return (
    <div className="pt-4 border-t border-gray-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <h4 className="font-medium text-gray-100 text-sm">Receta</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {recipeItems.length} ingredientes
            {totalCost > 0 && ` · $${totalCost.toFixed(2)}`}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Lista actual */}
          <div className="space-y-1.5">
            {recipeItems.map((item: any) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded text-sm"
              >
                <span className="text-gray-300">
                  {item.ingredients?.name}{" "}
                  <span className="text-gray-400">
                    ({item.quantity} {item.ingredients?.unit})
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 font-medium">
                    $
                    {(
                      item.quantity * (item.ingredients?.cost_per_unit || 0)
                    ).toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {recipeItems.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">
                Sin ingredientes en la receta
              </p>
            )}
          </div>

          {/* Agregar ingrediente */}
          <form onSubmit={handleAdd} className="flex gap-2">
            <select
              className="flex-1 border border-gray-600 rounded px-2 py-1.5 text-xs"
              value={selectedIngredient}
              onChange={(e) => setSelectedIngredient(e.target.value)}
            >
              <option value="">Seleccionar...</option>
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.name} ({ing.unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Cant."
              className="w-16 border border-gray-600 rounded px-2 py-1.5 text-xs"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <button className="px-3 py-1.5 bg-black text-white text-xs rounded hover:bg-gray-800">
              +
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
