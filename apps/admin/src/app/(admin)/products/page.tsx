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
        .select("*, product_variants(*, variant_types(*))")
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
    setPrice("");
    setCost("");
    setAllowHalf(false);
    setShowInMenu(true);
    setIsSuggestable(false);
    setIsFeatured(false);
    setIsHero(false);
    setImageFile(null);
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
      <aside className="w-64 bg-gray-50 border-r border-gray-200 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-800">Categorías</h2>
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
            {filteredProducts.length} productos
          </span>
        </div>

        <nav className="space-y-1">
          <button
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !selectedCategory
                ? "bg-black text-white font-medium"
                : "text-gray-700 hover:bg-gray-100"
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
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <span>{cat.name}</span>
                  {catProducts > 0 && (
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
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
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                      onClick={() => setSelectedCategory(sub.id)}
                    >
                      <span>{sub.name}</span>
                      {subProducts > 0 && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
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
            <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
            <p className="text-gray-500 text-sm mt-1">
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
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del producto *
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                    placeholder="Ej: Hamburguesa Clásica"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categoría *
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-black focus:border-black transition appearance-none bg-white"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                  placeholder="Describe tu producto..."
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Precio *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-3 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Costo (opcional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-3 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                      placeholder="0.00"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Imagen del producto
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
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
                    <span className="text-sm text-gray-600">
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
                  <h4 className="font-medium text-gray-900 mb-3">
                    Configuración
                  </h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                        checked={allowHalf}
                        onChange={(e) => setAllowHalf(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">
                        Permite mitades (ej: pizzas)
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                        checked={showInMenu}
                        onChange={(e) => setShowInMenu(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">
                        Visible en menú
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                        checked={isSuggestable}
                        onChange={(e) => setIsSuggestable(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">
                        Solo en sugerencias
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                        checked={isFeatured}
                        onChange={(e) => setIsFeatured(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">
                        Destacado (ocupa más espacio)
                      </span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                        checked={isHero}
                        onChange={(e) => setIsHero(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">
                        Hero (portada de categoría)
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">
                    Turnos disponibles
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {dayParts.map((part) => (
                      <label
                        key={part.id}
                        className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                          checked={selectedDayParts.includes(part.id)}
                          onChange={() => toggleDayPart(part.id)}
                        />
                        <span className="text-sm text-gray-700">
                          {part.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center">
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay productos
            </h3>
            <p className="text-gray-500 mb-6">
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
                className={`bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden ${
                  editingProduct?.id === product.id
                    ? "ring-2 ring-black"
                    : "hover:shadow-md transition-shadow"
                }`}
              >
                {editingProduct?.id === product.id ? (
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">
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
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nombre *
                        </label>
                        <input
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                          placeholder="Nombre del producto"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Descripción
                        </label>
                        <textarea
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                          placeholder="Descripción"
                          rows={2}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Precio *
                          </label>
                          <input
                            type="number"
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                            placeholder="0"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Costo
                          </label>
                          <input
                            type="number"
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                            placeholder="0"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Imagen
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
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
                            <span className="text-xs text-gray-500">
                              Imagen actual
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Categoría
                          </label>
                          <select
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
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
                            className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                            checked={allowHalf}
                            onChange={(e) => setAllowHalf(e.target.checked)}
                          />
                          <span className="text-sm text-gray-700">
                            Permite mitades
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                            checked={showInMenu}
                            onChange={(e) => setShowInMenu(e.target.checked)}
                          />
                          <span className="text-sm text-gray-700">
                            Visible en menú
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                            checked={isSuggestable}
                            onChange={(e) => setIsSuggestable(e.target.checked)}
                          />
                          <span className="text-sm text-gray-700">
                            Solo sugerencias
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
                          <h3 className="font-semibold text-gray-900 text-lg">
                            {product.name}
                          </h3>
                          {product.description && (
                            <p className="text-gray-500 text-sm mt-1">
                              {product.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => startEditProduct(product)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="Editar producto"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <span className="text-2xl font-bold text-gray-900">
                            ${product.product_variants?.[0]?.price || 0}
                          </span>
                          {product.product_variants?.[0]?.cost && (
                            <span className="text-sm text-gray-500 ml-2">
                              (Costo: ${product.product_variants[0].cost})
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

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <label className="text-gray-500 block mb-1">
                            Cocina asignada
                          </label>
                          <select
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
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

                        <div>
                          <label className="text-gray-500 block mb-1">
                            Receta
                          </label>
                          <a
                            href={`/products/${product.id}/variants/${product.product_variants?.[0]?.id}/recipe`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                            </svg>
                            Ver receta
                          </a>
                        </div>
                      </div>

                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <h4 className="font-medium text-gray-900 mb-3">
                          Extras disponibles
                        </h4>
                        {modifierGroups.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {modifierGroups.map((group) => (
                              <label
                                key={group.id}
                                className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-black rounded border-gray-300 focus:ring-black"
                                  checked={
                                    productGroups[product.id]?.includes(
                                      group.id,
                                    ) || false
                                  }
                                  onChange={() =>
                                    toggleGroup(product.id, group.id)
                                  }
                                />
                                <span className="text-sm text-gray-700">
                                  {group.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">
                            No hay grupos de extras configurados
                          </p>
                        )}
                      </div>
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
