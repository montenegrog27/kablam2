"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, RefreshCcw, Smartphone } from "lucide-react";

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
  active: boolean | null;
};

type Product = {
  id: string;
  name: string;
  category_id: string | null;
  qr_position: number | null;
  qr_visible: boolean | null;
  show_in_menu: boolean | null;
  is_active: boolean | null;
  product_variants?: Array<{
    id: string;
    price: number;
    image_url?: string | null;
    is_default?: boolean | null;
  }>;
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

export default function QrMenuAdminPage() {
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
  const previewUrl = selectedBranch ? `${getCustomerBaseUrl()}/${selectedBranch.slug}/qr` : "";

  const rootCategories = useMemo(
    () =>
      categories
        .filter((category) => !category.parent_id)
        .sort((a, b) => orderValue(a.qr_position, orderValue(a.position)) - orderValue(b.qr_position, orderValue(b.position))),
    [categories],
  );

  const getSortedChildren = (parentId: string) =>
    categories
      .filter((category) => category.parent_id === parentId)
      .sort((a, b) => orderValue(a.qr_position, orderValue(a.position)) - orderValue(b.qr_position, orderValue(b.position)));

  const sortedProductsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    categories.forEach((category) => {
      map.set(
        category.id,
        products
          .filter((product) => product.category_id === category.id)
          .sort((a, b) => orderValue(a.qr_position) - orderValue(b.qr_position) || a.name.localeCompare(b.name)),
      );
    });
    return map;
  }, [categories, products]);

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
        .select("id, name, parent_id, position, qr_position, qr_visible, active")
        .eq("tenant_id", nextTenantId)
        .order("qr_position", { ascending: true })
        .order("position", { ascending: true }),
      supabase
        .from("products")
        .select("id, name, category_id, qr_position, qr_visible, show_in_menu, is_active, product_variants(id, price, image_url, is_default)")
        .eq("tenant_id", nextTenantId)
        .eq("branch_id", nextBranchId)
        .order("qr_position", { ascending: true })
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
      setMessage("Menu QR actualizado");
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
      setMessage("Menu QR actualizado");
    }
    setSavingId("");
  }

  async function moveCategory(categoryId: string, direction: -1 | 1) {
    const movingCategory = categories.find((category) => category.id === categoryId);
    if (!movingCategory) return;
    const siblings = categories
      .filter((category) => category.parent_id === movingCategory.parent_id)
      .sort((a, b) => orderValue(a.qr_position, orderValue(a.position)) - orderValue(b.qr_position, orderValue(b.position)));
    const index = siblings.findIndex((category) => category.id === categoryId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const updates = reordered.map((category, nextIndex) => ({
      id: category.id,
      qr_position: nextIndex,
    }));

    setSavingId(categoryId);
    const results = await Promise.all(
      updates.map((item) => supabase.from("categories").update({ qr_position: item.qr_position }).eq("id", item.id)),
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
        return update ? { ...category, qr_position: update.qr_position } : category;
      }),
    );
    setMessage("Orden del menu QR actualizado");
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
      qr_position: nextIndex,
    }));

    setSavingId(productId);
    const results = await Promise.all(
      updates.map((item) => supabase.from("products").update({ qr_position: item.qr_position }).eq("id", item.id)),
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
        return update ? { ...product, qr_position: update.qr_position } : product;
      }),
    );
    setMessage("Orden del menu QR actualizado");
    setSavingId("");
  }

  if (loading && !categories.length) {
    return <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">Cargando menu QR...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Customer QR</p>
          <h1 className="mt-1 text-3xl font-black text-white">Menu QR de mesa</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Controla que ve el cliente cuando escanea el QR: visibilidad, orden de categorias, orden de productos y preview.
          </p>
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
              Abrir QR
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
            const visible = category.qr_visible !== false;

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
                      {categoryProducts.length + childProductCount} productos · pos {orderValue(category.qr_position, orderValue(category.position))}
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
                      onClick={() => updateCategory(category.id, { qr_visible: !visible })}
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
                  savingId={savingId}
                  onMoveProduct={moveProduct}
                  onUpdateProduct={updateProduct}
                />

                {children.map((child, childIndex) => (
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
                          onClick={() => updateCategory(child.id, { qr_visible: child.qr_visible === false })}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${
                            child.qr_visible !== false ? "bg-emerald-500/10 text-emerald-300" : "bg-gray-800 text-gray-300"
                          }`}
                        >
                          {child.qr_visible !== false ? <Eye size={15} /> : <EyeOff size={15} />}
                          {child.qr_visible !== false ? "Visible" : "Oculta"}
                        </button>
                      </div>
                    </div>
                    <CategoryProducts
                      category={child}
                      products={sortedProductsByCategory.get(child.id) || []}
                      savingId={savingId}
                      onMoveProduct={moveProduct}
                      onUpdateProduct={updateProduct}
                    />
                  </div>
                ))}
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
                <iframe title="Vista previa menu QR" src={previewUrl} className="h-[720px] w-full bg-white" />
              ) : (
                <div className="flex h-[720px] items-center justify-center p-6 text-center text-sm text-gray-500">
                  Elegi una sucursal para ver el QR.
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
  savingId,
  onMoveProduct,
  onUpdateProduct,
}: {
  category: Category;
  products: Product[];
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
        const visible = product.qr_visible !== false;
        return (
          <div key={product.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-100">{product.name}</p>
              <p className="text-xs text-gray-500">
                {money(getPrice(product))} · QR pos {orderValue(product.qr_position, index)}
                {product.show_in_menu === false ? " · oculto en delivery" : ""}
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
              onClick={() => onUpdateProduct(product.id, { qr_visible: !visible })}
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
