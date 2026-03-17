"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function ProductsPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [variantTypes, setVariantTypes] = useState<any[]>([]);
  const [kitchens, setKitchens] = useState<any[]>([]);
  const [kitchenProducts, setKitchenProducts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedDayParts, setSelectedDayParts] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [dayParts, setDayParts] = useState<any[]>([]);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [productGroups, setProductGroups] = useState<Record<string, string[]>>(
    {},
  );
  const [variants, setVariants] = useState<any[]>([
    {
      name: "",
      variant_type_id: "",
      price: "",
      cost: "",
      description: "",
      file: null,
      is_default: true,
    },
  ]);

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

      const { data: types } = await supabase
        .from("variant_types")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("position");

      setVariantTypes(types || []);

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

  const handleAddVariant = () => {
    setVariants([
      ...variants,
      {
        name: "",
        variant_type_id: "",
        price: "",
        cost: "",
        description: "",
        file: null,
        is_default: false,
      },
    ]);
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
  const handleVariantChange = (index: number, field: string, value: any) => {
    const updated = [...variants];
    updated[index][field] = value;
    setVariants(updated);
  };

  const handleCreateProduct = async (e: any) => {
    e.preventDefault();
    console.log("CLICKED SUBMIT");
    if (!tenantId || !branchId || !categoryId) {
      alert("Completa todos los campos");
      return;
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        name,
        description,
        category_id: categoryId,
      })
      .select()
      .single();

    if (productError) {
      alert(productError.message);
      return;
    }

    const variantsToInsert: any[] = [];

    for (const v of variants) {
      console.log("PROCESSING VARIANT", v);
      let imageUrl = null;

      if (v.file) {
        const fileExt = v.file.name.split(".").pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(fileName, v.file);

        if (uploadError) {
          alert(uploadError.message);
          return;
        }

        const { data } = supabase.storage
          .from("product-images")
          .getPublicUrl(fileName);

        imageUrl = data.publicUrl;
      }

      console.log("TENANT FROM USERS TABLE:", tenantId);
      console.log("VARIANTS TO INSERT:", variantsToInsert);
      if (!v.variant_type_id) {
        alert("Seleccioná tipo de variante");
        return;
      }

      variantsToInsert.push({
        product_id: (product as any).id,
        tenant_id: tenantId as string,
        name: v.name,
        variant_type_id: v.variant_type_id || null, // 👈 ESTA LÍNEA
        price: Number(v.price),
        cost: v.cost ? Number(v.cost) : null,
        description: v.description || null,
        image_url: imageUrl,
        is_default: v.is_default,
      });
    }

    const { error: variantError } = await supabase
      .from("product_variants")
      .insert(variantsToInsert);

    console.log("VARIANT ERROR:", variantError);

    if (variantError) {
      alert("VARIANTS FAIL");
      return;
    }

    const relations = selectedDayParts.map((partId) => ({
      product_id: (product as any).id,
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
    setVariants([{ name: "Default", price: "", cost: "", is_default: true }]);

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
  return (
    <div className="flex gap-6">
      <aside className="w-64 bg-black rounded shadow p-4">
        <h2 className="font-semibold mb-4">Categorías</h2>

        <button
          className={`block w-full text-left mb-2 ${
            !selectedCategory ? "font-bold" : ""
          }`}
          onClick={() => setSelectedCategory(null)}
        >
          Todas
        </button>

        {rootCategories.map((cat) => (
          <div key={cat.id}>
            <button
              className="block w-full text-left mb-1"
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </button>

            {categories
              .filter((sub) => sub.parent_id === cat.id)
              .map((sub) => (
                <button
                  key={sub.id}
                  className="block w-full text-left ml-4 text-sm mb-1"
                  onClick={() => setSelectedCategory(sub.id)}
                >
                  └ {sub.name}
                </button>
              ))}
          </div>
        ))}
      </aside>

      <main className="flex-1">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Productos</h1>
          <button
            className="bg-black text-white px-4 py-2 rounded"
            onClick={() => setShowForm(!showForm)}
          >
            Nuevo Producto
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreateProduct}
            className="bg-black p-6 rounded shadow mb-8 space-y-4"
          >
            <input
              className="border p-2 w-full"
              placeholder="Nombre producto"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <textarea
              className="border p-2 w-full"
              placeholder="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <select
              className="border p-2 w-full"
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
            <div>
              <h3 className="font-semibold mb-2">Turnos disponibles</h3>

              {dayParts.map((part) => (
                <label key={part.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedDayParts.includes(part.id)}
                    onChange={() => toggleDayPart(part.id)}
                  />
                  {part.name}
                </label>
              ))}
            </div>

            <h3 className="font-semibold">Variantes</h3>

            {variants.map((variant, index) => (
              <div key={index} className="border p-3 rounded space-y-2">
                <input
                  className="border p-2 w-full"
                  placeholder="Nombre variante"
                  value={variant.name}
                  onChange={(e) =>
                    handleVariantChange(index, "name", e.target.value)
                  }
                />
                <textarea
                  className="border p-2 w-full"
                  placeholder="Descripción específica de esta variante"
                  value={variant.description}
                  onChange={(e) =>
                    handleVariantChange(index, "description", e.target.value)
                  }
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleVariantChange(index, "file", e.target.files?.[0])
                  }
                />

                <select
                  className="border p-2 w-full"
                  value={variant.variant_type_id}
                  onChange={(e) =>
                    handleVariantChange(
                      index,
                      "variant_type_id",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Tipo de variante</option>
                  {variantTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>

                <input
                  className="border p-2 w-full"
                  type="number"
                  placeholder="Precio"
                  value={variant.price}
                  onChange={(e) =>
                    handleVariantChange(index, "price", e.target.value)
                  }
                />
                <input
                  className="border p-2 w-full"
                  type="number"
                  placeholder="Costo manual (opcional)"
                  value={variant.cost}
                  onChange={(e) =>
                    handleVariantChange(index, "cost", e.target.value)
                  }
                />
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddVariant}
              className="text-sm underline"
            >
              + Agregar variante
            </button>

            <button className="bg-black text-white px-4 py-2 rounded">
              Guardar Producto
            </button>
          </form>
        )}

        <div className="space-y-4">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-black p-4 rounded shadow">
              <h3 className="font-semibold">{product.name}</h3>
              <div className="mt-2">
                <label className="text-sm text-gray-400">Cocina:</label>

                <select
                  className="ml-2 border p-1 text-sm"
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
              <h4 className="mt-4 font-semibold">Extras disponibles</h4>

              {modifierGroups.map((group) => (
                <label key={group.id} className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={
                      productGroups[product.id]?.includes(group.id) || false
                    }
                    onChange={() => toggleGroup(product.id, group.id)}
                  />

                  {group.name}
                </label>
              ))}
              {product.product_variants?.map((variant: any) => (
                <div
                  key={variant.id}
                  className="flex justify-between items-center text-sm text-gray-600"
                >
                  <div>
                    <div className="font-semibold">
                      {variant.variant_types?.name} - ${variant.price}
                    </div>

                    {variant.description && (
                      <div className="text-xs text-gray-400">
                        {variant.description}
                      </div>
                    )}

                    {variant.image_url && (
                      <img
                        src={variant.image_url}
                        className="w-16 h-16 object-cover rounded mt-2"
                      />
                    )}
                  </div>

                  <a
                    href={`/products/${product.id}/variants/${variant.id}/recipe`}
                    className="text-blue-600 underline"
                  >
                    Receta
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
