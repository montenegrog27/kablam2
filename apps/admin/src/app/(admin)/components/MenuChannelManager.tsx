"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, RefreshCcw, Smartphone } from "lucide-react";

type Channel = "qr" | "delivery" | "catalog";

type Branch = {
  id: string;
  name: string;
  slug: string;
};

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  position: number | null;
  qr_position: number | null;
  qr_visible: boolean | null;
  delivery_position: number | null;
  delivery_visible: boolean | null;
  catalog_position: number | null;
  catalog_visible: boolean | null;
  active: boolean | null;
};

type Product = {
  id: string;
  name: string;
  category_id: string | null;
  qr_position: number | null;
  qr_visible: boolean | null;
  delivery_position: number | null;
  show_in_menu: boolean | null;
  catalog_position: number | null;
  catalog_visible: boolean | null;
  is_active: boolean | null;
  product_variants?: Array<{
    id: string;
    price: number;
    image_url?: string | null;
    is_default?: boolean | null;
  }>;
};

type ChannelConfig = {
  channel: Channel;
  eyebrow: string;
  title: string;
  description: string;
  previewPath: string;
  previewLabel: string;
  successMessage: string;
  categoryPosition: keyof Category;
  categoryVisible: keyof Category;
  productPosition: keyof Product;
  productVisible: keyof Product;
};

const CHANNELS: Record<Channel, ChannelConfig> = {
  qr: {
    channel: "qr",
    eyebrow: "Customer QR",
    title: "Menu QR de mesa",
    description: "Controla que ve el cliente cuando escanea el QR: visibilidad, orden de categorias, orden de productos y preview.",
    previewPath: "qr",
    previewLabel: "Abrir QR",
    successMessage: "Menu QR actualizado",
    categoryPosition: "qr_position",
    categoryVisible: "qr_visible",
    productPosition: "qr_position",
    productVisible: "qr_visible",
  },
  delivery: {
    channel: "delivery",
    eyebrow: "Customer Delivery",
    title: "Menu Delivery",
    description: "Ordena y controla categorias y productos visibles en /order. Las categorias ocultas no aparecen como tabs.",
    previewPath: "order",
    previewLabel: "Abrir Delivery",
    successMessage: "Menu delivery actualizado",
    categoryPosition: "delivery_position",
    categoryVisible: "delivery_visible",
    productPosition: "delivery_position",
    productVisible: "show_in_menu",
  },
  catalog: {
    channel: "catalog",
    eyebrow: "Customer Catalogo",
    title: "Menu Catalogo",
    description: "Ordena y controla categorias y productos visibles en /catalogo. Las categorias ocultas no aparecen como tabs.",
    previewPath: "catalogo",
    previewLabel: "Abrir Catalogo",
    successMessage: "Menu catalogo actualizado",
    categoryPosition: "catalog_position",
    categoryVisible: "catalog_visible",
    productPosition: "catalog_position",
    productVisible: "catalog_visible",
  },
};

function money(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-AR")}`;
}

function orderValue(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function getPrice(product: Product) {
  const variant = product.product_variants?.find((item) => item.is_default) || product.product_variants?.[0];
  return Number(variant?.price || 0);
}

function getCustomerBaseUrl() {
  return (process.env.NEXT_PUBLIC_CUSTOMER_APP_URL || "http://localhost:3002").replace(/\/$/, "");
}

export default function MenuChannelManager({ channel }: { channel: Channel }) {
  const config = CHANNELS[channel];
  const [tenantId, setTenantId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (tenantId && branchId) loadMenuData(tenantId, branchId);
  }, [tenantId, branchId]);

  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const previewUrl = selectedBranch ? `${getCustomerBaseUrl()}/${selectedBranch.slug}/${config.previewPath}` : "";

  const getCategoryPosition = (category: Category) =>
    orderValue(category[config.categoryPosition] as number | null, orderValue(category.position));

  const getProductPosition = (product: Product, fallback = 0) =>
    orderValue(product[config.productPosition] as number | null, fallback);

  const rootCategories = useMemo(
    () =>
      categories
        .filter((category) => !category.parent_id)
        .sort((a, b) => getCategoryPosition(a) - getCategoryPosition(b)),
    [categories, config.categoryPosition],
  );

  const getSortedChildren = (parentId: string) =>
    categories
      .filter((category) => category.parent_id === parentId)
      .sort((a, b) => getCategoryPosition(a) - getCategoryPosition(b));

  const sortedProductsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    categories.forEach((category) => {
      map.set(
        category.id,
        products
          .filter((product) => product.category_id === category.id)
          .sort((a, b) => getProductPosition(a) - getProductPosition(b) || a.name.localeCompare(b.name)),
      );
    });
    return map;
  }, [categories, products, config.productPosition]);

  async function loadBootstrap() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) return;

    setTenantId(userRecord.tenant_id);

    const { data: branchRows } = await supabase
      .from("branches")
      .select("id, name, slug")
      .eq("tenant_id", userRecord.tenant_id)
      .or("active.is.null,active.eq.true")
      .order("name");

    const loadedBranches = branchRows || [];
    setBranches(loadedBranches);
    setBranchId(userRecord.branch_id || loadedBranches[0]?.id || "");
    setLoading(false);
  }

  async function loadMenuData(nextTenantId = tenantId, nextBranchId = branchId) {
    if (!nextTenantId || !nextBranchId) return;
    setLoading(true);

    const [{ data: categoryRows }, { data: productRows }] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, parent_id, position, qr_position, qr_visible, delivery_position, delivery_visible, catalog_position, catalog_visible, active")
        .eq("tenant_id", nextTenantId)
        .order(config.categoryPosition as string, { ascending: true })
        .order("position", { ascending: true }),
      supabase
        .from("products")
        .select("id, name, category_id, qr_position, qr_visible, delivery_position, show_in_menu, catalog_position, catalog_visible, is_active, product_variants(id, price, image_url, is_default)")
        .eq("tenant_id", nextTenantId)
        .eq("branch_id", nextBranchId)
        .order(config.productPosition as string, { ascending: true })
        .order("name", { ascending: true }),
    ]);

    setCategories((categoryRows || []) as Category[]);
    setProducts((productRows || []) as Product[]);
    setLoading(false);
  }

  async function updateCategory(id: string, payload: Partial<Category>) {
    setSavingId(id);
    const { error } = await supabase.from("categories").update(payload).eq("id", id);
    if (error) {
      alert(error.message);
    } else {
      setCategories((prev) => prev.map((category) => (category.id === id ? { ...category, ...payload } : category)));
      setMessage(config.successMessage);
    }
    setSavingId("");
  }

  async function updateProduct(id: string, payload: Partial<Product>) {
    setSavingId(id);
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) {
      alert(error.message);
    } else {
      setProducts((prev) => prev.map((product) => (product.id === id ? { ...product, ...payload } : product)));
      setMessage(config.successMessage);
    }
    setSavingId("");
  }

  async function moveCategory(categoryId: string, direction: -1 | 1) {
    const movingCategory = categories.find((category) => category.id === categoryId);
    if (!movingCategory) return;
    const siblings = categories
      .filter((category) => category.parent_id === movingCategory.parent_id)
      .sort((a, b) => getCategoryPosition(a) - getCategoryPosition(b));
    const index = siblings.findIndex((category) => category.id === categoryId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const updates = reordered.map((category, nextIndex) => ({
      id: category.id,
      [config.categoryPosition]: nextIndex,
    }));

    setSavingId(categoryId);
    const results = await Promise.all(
      updates.map((item) => supabase.from("categories").update({ [config.categoryPosition]: item[config.categoryPosition] }).eq("id", item.id)),
    );
    const error = results.find((result) => result.error)?.error;
    if (error) {
      alert(error.message);
      setSavingId("");
      return;
    }
    setCategories((prev) =>
      prev.map((category) => {
        const update = updates.find((item) => item.id === category.id);
        return update ? { ...category, [config.categoryPosition]: update[config.categoryPosition] } : category;
      }),
    );
    setMessage(`Orden de ${config.title.toLowerCase()} actualizado`);
    setSavingId("");
  }

  async function moveProduct(productId: string, categoryId: string, direction: -1 | 1) {
    const list = sortedProductsByCategory.get(categoryId) || [];
    const index = list.findIndex((product) => product.id === productId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return;

    const reordered = [...list];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const updates = reordered.map((product, nextIndex) => ({
      id: product.id,
      [config.productPosition]: nextIndex,
    }));

    setSavingId(productId);
    const results = await Promise.all(
      updates.map((item) => supabase.from("products").update({ [config.productPosition]: item[config.productPosition] }).eq("id", item.id)),
    );
    const error = results.find((result) => result.error)?.error;
    if (error) {
      alert(error.message);
      setSavingId("");
      return;
    }
    setProducts((prev) =>
      prev.map((product) => {
        const update = updates.find((item) => item.id === product.id);
        return update ? { ...product, [config.productPosition]: update[config.productPosition] } : product;
      }),
    );
    setMessage(`Orden de ${config.title.toLowerCase()} actualizado`);
    setSavingId("");
  }

  if (loading && !categories.length) {
    return <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">Cargando {config.title.toLowerCase()}...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">{config.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-black text-white">{config.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">{config.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-white outline-none"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => loadMenuData()}
            className="flex items-center gap-2 rounded-xl border border-gray-700 px-3 py-3 text-sm font-bold text-gray-300"
          >
            <RefreshCcw size={16} />
            Refrescar
          </button>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              className="flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm font-black text-gray-950"
            >
              <ExternalLink size={16} />
              {config.previewLabel}
            </a>
          )}
        </div>
      </div>

      {message && <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
        <section className="space-y-4">
          {rootCategories.map((category, categoryIndex) => {
            const children = getSortedChildren(category.id);
            const categoryProducts = sortedProductsByCategory.get(category.id) || [];
            const childProductCount = children.reduce((sum, child) => sum + (sortedProductsByCategory.get(child.id)?.length || 0), 0);
            const visible = category[config.categoryVisible] !== false;

            return (
              <div key={category.id} className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
                <div className="flex flex-col gap-3 border-b border-gray-800 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-lg font-black text-white">{category.name}</h2>
                      {!visible && <span className="rounded-full bg-gray-700 px-2 py-1 text-[10px] font-black text-gray-300">Oculta</span>}
                      {category.active === false && <span className="rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-black text-red-300">Inactiva</span>}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {categoryProducts.length + childProductCount} productos · pos {getCategoryPosition(category)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveCategory(category.id, -1)}
                      disabled={categoryIndex === 0 || savingId === category.id}
                      className="rounded-lg border border-gray-700 p-2 text-gray-300 disabled:opacity-30"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      onClick={() => moveCategory(category.id, 1)}
                      disabled={categoryIndex === rootCategories.length - 1 || savingId === category.id}
                      className="rounded-lg border border-gray-700 p-2 text-gray-300 disabled:opacity-30"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      onClick={() => updateCategory(category.id, { [config.categoryVisible]: !visible } as Partial<Category>)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${
                        visible ? "bg-emerald-500/10 text-emerald-300" : "bg-gray-800 text-gray-300"
                      }`}
                    >
                      {visible ? <Eye size={15} /> : <EyeOff size={15} />}
                      {visible ? "Visible" : "Oculta"}
                    </button>
                  </div>
                </div>

                <CategoryProducts
                  category={category}
                  products={categoryProducts}
                  config={config}
                  savingId={savingId}
                  onMoveProduct={moveProduct}
                  onUpdateProduct={updateProduct}
                />

                {children.map((child, childIndex) => {
                  const childVisible = child[config.categoryVisible] !== false;
                  return (
                    <div key={child.id} className="border-t border-gray-800 bg-gray-950/30">
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <p className="text-sm font-black text-gray-200">{child.name}</p>
                          <p className="text-xs text-gray-500">{sortedProductsByCategory.get(child.id)?.length || 0} productos</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => moveCategory(child.id, -1)}
                            disabled={childIndex === 0 || savingId === child.id}
                            className="rounded-lg border border-gray-700 p-2 text-gray-300 disabled:opacity-30"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => moveCategory(child.id, 1)}
                            disabled={childIndex === children.length - 1 || savingId === child.id}
                            className="rounded-lg border border-gray-700 p-2 text-gray-300 disabled:opacity-30"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            onClick={() => updateCategory(child.id, { [config.categoryVisible]: !childVisible } as Partial<Category>)}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${
                              childVisible ? "bg-emerald-500/10 text-emerald-300" : "bg-gray-800 text-gray-300"
                            }`}
                          >
                            {childVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                            {childVisible ? "Visible" : "Oculta"}
                          </button>
                        </div>
                      </div>
                      <CategoryProducts
                        category={child}
                        products={sortedProductsByCategory.get(child.id) || []}
                        config={config}
                        savingId={savingId}
                        onMoveProduct={moveProduct}
                        onUpdateProduct={updateProduct}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>

        <aside className="xl:sticky xl:top-6">
          <div className="rounded-3xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">Vista previa</p>
                <p className="font-black text-white">{selectedBranch?.name || "Sucursal"}</p>
              </div>
              <Smartphone className="text-emerald-300" size={22} />
            </div>
            <div className="overflow-hidden rounded-[2rem] border-8 border-gray-950 bg-white shadow-2xl">
              {previewUrl ? (
                <iframe title={`Vista previa ${config.title}`} src={previewUrl} className="h-[720px] w-full bg-white" />
              ) : (
                <div className="flex h-[720px] items-center justify-center p-6 text-center text-sm text-gray-500">
                  Elegi una sucursal para ver la vista previa.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CategoryProducts({
  category,
  products,
  config,
  savingId,
  onMoveProduct,
  onUpdateProduct,
}: {
  category: Category;
  products: Product[];
  config: ChannelConfig;
  savingId: string;
  onMoveProduct: (productId: string, categoryId: string, direction: -1 | 1) => void;
  onUpdateProduct: (productId: string, payload: Partial<Product>) => void;
}) {
  if (!products.length) {
    return <div className="px-4 py-5 text-sm text-gray-500">Sin productos en esta categoria.</div>;
  }

  return (
    <div className="divide-y divide-gray-800">
      {products.map((product, index) => {
        const visible = product[config.productVisible] !== false;
        return (
          <div key={product.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-100">{product.name}</p>
              <p className="text-xs text-gray-500">
                {money(getPrice(product))} · pos {orderValue(product[config.productPosition] as number | null, index)}
                {product.is_active === false ? " · inactivo" : ""}
              </p>
            </div>
            <button
              onClick={() => onMoveProduct(product.id, category.id, -1)}
              disabled={index === 0 || savingId === product.id}
              className="rounded-lg border border-gray-700 p-2 text-gray-300 disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <button
              onClick={() => onMoveProduct(product.id, category.id, 1)}
              disabled={index === products.length - 1 || savingId === product.id}
              className="rounded-lg border border-gray-700 p-2 text-gray-300 disabled:opacity-30"
            >
              <ArrowDown size={14} />
            </button>
            <button
              onClick={() => onUpdateProduct(product.id, { [config.productVisible]: !visible } as Partial<Product>)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${
                visible ? "bg-emerald-500/10 text-emerald-300" : "bg-gray-800 text-gray-300"
              }`}
            >
              {visible ? <Eye size={14} /> : <EyeOff size={14} />}
              {visible ? "Visible" : "Oculto"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
