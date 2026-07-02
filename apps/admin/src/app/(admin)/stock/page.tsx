"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, History, Package, Plus, Search, SlidersHorizontal } from "lucide-react";

const unitLabels: Record<string, string> = {
  unit: "u",
  kg: "kg",
  g: "g",
  liter: "L",
  ml: "ml",
  pack: "packs",
  box: "cajas",
};

function formatQty(value: number, unit: string) {
  return `${Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${unitLabels[unit] || unit}`;
}

function movementLabel(type: string) {
  const labels: Record<string, string> = {
    sale: "Venta",
    sale_reversal: "Reversion venta",
    adjustment: "Ajuste",
    purchase: "Compra",
    waste: "Merma",
    transfer_in: "Transferencia entrante",
    transfer_out: "Transferencia saliente",
  };
  return labels[type] || type;
}

export default function StockPage() {
  const [tenantId, setTenantId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adjustingProduct, setAdjustingProduct] = useState<any | null>(null);
  const [adjustment, setAdjustment] = useState({ quantity: "", type: "adjustment", reason: "" });

  async function loadMeta() {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();
    if (!userRecord?.tenant_id) return;

    setTenantId(userRecord.tenant_id);
    setBranchId(userRecord.branch_id);

    const { data: branchRows } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");
    setBranches(branchRows || []);
  }

  async function loadStock() {
    if (!tenantId || !branchId) return;
    setLoading(true);
    const [productsRes, itemsRes, movementsRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, category_id, manages_stock, stock_unit, stock_low_threshold, categories(name)")
        .eq("tenant_id", tenantId)
        .eq("manages_stock", true)
        .order("name"),
      supabase
        .from("stock_items")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId),
      supabase
        .from("stock_movements")
        .select("*, products(name)")
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    setProducts(productsRes.data || []);
    setItems(itemsRes.data || []);
    setMovements(movementsRes.data || []);
    setLoading(false);
  }

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { loadStock(); }, [tenantId, branchId]);

  const rows = useMemo(() => {
    const itemByProduct = new Map(items.map((item) => [item.product_id, item]));
    return products.map((product) => {
      const item = itemByProduct.get(product.id);
      const unit = item?.unit || product.stock_unit || "unit";
      const low = Number(item?.low_threshold ?? product.stock_low_threshold ?? 0);
      const current = Number(item?.current_quantity || 0);
      return {
        ...product,
        stockItem: item,
        unit,
        lowThreshold: low,
        currentQuantity: current,
        isLow: low > 0 && current <= low,
        isOut: current <= 0,
      };
    });
  }, [products, items]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !q || row.name?.toLowerCase().includes(q) || row.categories?.name?.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "low" && row.isLow) ||
        (statusFilter === "out" && row.isOut) ||
        (statusFilter === "ok" && !row.isLow && !row.isOut);
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const summary = useMemo(() => ({
    total: rows.length,
    ok: rows.filter((row) => !row.isLow && !row.isOut).length,
    low: rows.filter((row) => row.isLow && !row.isOut).length,
    out: rows.filter((row) => row.isOut).length,
  }), [rows]);

  async function openAdjustment(product: any) {
    setAdjustingProduct(product);
    setAdjustment({ quantity: "", type: "adjustment", reason: "" });
  }

  async function saveAdjustment() {
    if (!adjustingProduct || !tenantId || !branchId) return;
    const rawQuantity = Number(adjustment.quantity || 0);
    if (!Number.isFinite(rawQuantity) || rawQuantity === 0) {
      alert("Carga una cantidad distinta de 0.");
      return;
    }

    const item = adjustingProduct.stockItem;
    const before = Number(item?.current_quantity || 0);
    const delta = ["sale", "waste", "transfer_out"].includes(adjustment.type)
      ? -Math.abs(rawQuantity)
      : Math.abs(rawQuantity);
    const after = before + delta;
    const unit = adjustingProduct.unit || "unit";
    const lowThreshold = Number(adjustingProduct.lowThreshold || 0);

    const { data: auth } = await supabase.auth.getUser();

    const { error: itemError } = await supabase.from("stock_items").upsert({
      tenant_id: tenantId,
      branch_id: branchId,
      product_id: adjustingProduct.id,
      current_quantity: after,
      unit,
      low_threshold: lowThreshold,
      updated_at: new Date().toISOString(),
    }, { onConflict: "branch_id,product_id" });

    if (itemError) {
      alert(`No se pudo actualizar stock: ${itemError.message}`);
      return;
    }

    const { error: movementError } = await supabase.from("stock_movements").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      product_id: adjustingProduct.id,
      movement_type: adjustment.type,
      quantity_delta: delta,
      quantity_before: before,
      quantity_after: after,
      unit,
      reason: adjustment.reason || null,
      created_by: auth.user?.id || null,
      metadata: { source: "admin_stock" },
    });

    if (movementError) {
      alert(`Stock actualizado, pero no se pudo registrar movimiento: ${movementError.message}`);
    }

    setAdjustingProduct(null);
    await loadStock();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black uppercase text-emerald-200">
            <Boxes size={14} />
            Inventario
          </div>
          <h1 className="text-3xl font-black tracking-tight text-gray-50">Stock</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Control por sucursal con unidades, kg, litros, packs, ajustes, ventas y reversiones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-100"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
          <button onClick={loadStock} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-200 hover:border-gray-700">
            Actualizar
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Productos con stock" value={summary.total} icon={Package} tone="text-sky-300" />
        <Kpi label="En orden" value={summary.ok} icon={ArrowUpRight} tone="text-emerald-300" />
        <Kpi label="Stock bajo" value={summary.low} icon={AlertTriangle} tone="text-amber-300" />
        <Kpi label="Sin stock" value={summary.out} icon={ArrowDownRight} tone="text-red-300" />
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto o categoria..."
              className="w-full rounded-xl border border-gray-800 bg-black py-3 pl-10 pr-3 text-sm font-semibold text-gray-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-gray-500" />
            {[
              ["all", "Todos"],
              ["ok", "OK"],
              ["low", "Bajo"],
              ["out", "Sin stock"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${
                  statusFilter === value
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
                    : "border-gray-800 bg-black text-gray-400 hover:text-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-gray-800">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-500">Cargando stock...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-10 text-center">
              <Boxes className="mx-auto mb-3 text-gray-600" size={34} />
              <p className="font-bold text-gray-200">Sin productos con stock</p>
              <p className="mt-1 text-sm text-gray-500">Activa &quot;Maneja stock&quot; en Productos.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {filteredRows.map((row) => (
                <div key={row.id} className="grid gap-3 bg-black/30 p-4 md:grid-cols-[1fr_180px_180px_130px] md:items-center">
                  <div>
                    <p className="font-black uppercase tracking-tight text-gray-100">{row.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.categories?.name || "Sin categoria"} · Unidad: {unitLabels[row.unit] || row.unit}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500">Stock actual</p>
                    <p className={`mt-1 text-xl font-black ${row.isOut ? "text-red-300" : row.isLow ? "text-amber-300" : "text-emerald-300"}`}>
                      {formatQty(row.currentQuantity, row.unit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500">Alerta bajo</p>
                    <p className="mt-1 text-sm font-bold text-gray-300">{formatQty(row.lowThreshold, row.unit)}</p>
                  </div>
                  <button
                    onClick={() => openAdjustment(row)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-black hover:bg-emerald-400"
                  >
                    <Plus size={16} />
                    Ajustar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="inline-flex items-center gap-2 text-sm font-black uppercase text-gray-100">
            <History size={16} />
            Ultimos movimientos
          </h2>
        </div>
        <div className="divide-y divide-gray-800">
          {movements.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Todavia no hay movimientos.</div>
          ) : movements.map((movement) => (
            <div key={movement.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_160px_160px_160px] md:items-center">
              <div>
                <p className="font-bold text-gray-100">{movement.products?.name || "Producto"}</p>
                <p className="text-xs text-gray-500">{movement.reason || movementLabel(movement.movement_type)}</p>
              </div>
              <p className={`font-black ${Number(movement.quantity_delta) < 0 ? "text-red-300" : "text-emerald-300"}`}>
                {Number(movement.quantity_delta) > 0 ? "+" : ""}{formatQty(Number(movement.quantity_delta), movement.unit)}
              </p>
              <p className="text-sm text-gray-400">{formatQty(Number(movement.quantity_after), movement.unit)}</p>
              <p className="text-xs text-gray-500">{new Date(movement.created_at).toLocaleString("es-AR")}</p>
            </div>
          ))}
        </div>
      </section>

      {adjustingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-950 p-5">
            <h3 className="text-xl font-black text-gray-50">Ajustar stock</h3>
            <p className="mt-1 text-sm text-gray-400">{adjustingProduct.name}</p>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase text-gray-500">Tipo</span>
                <select
                  value={adjustment.type}
                  onChange={(event) => setAdjustment((current) => ({ ...current, type: event.target.value }))}
                  className="w-full rounded-xl border border-gray-800 bg-black px-3 py-3 text-sm font-semibold text-gray-100"
                >
                  <option value="adjustment">Ajuste positivo</option>
                  <option value="purchase">Compra / ingreso</option>
                  <option value="waste">Merma / perdida</option>
                  <option value="transfer_in">Transferencia entrante</option>
                  <option value="transfer_out">Transferencia saliente</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase text-gray-500">Cantidad ({unitLabels[adjustingProduct.unit] || adjustingProduct.unit})</span>
                <input
                  type="number"
                  step="0.001"
                  value={adjustment.quantity}
                  onChange={(event) => setAdjustment((current) => ({ ...current, quantity: event.target.value }))}
                  className="w-full rounded-xl border border-gray-800 bg-black px-3 py-3 text-sm font-semibold text-gray-100"
                  placeholder="Ej: 10"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase text-gray-500">Motivo</span>
                <textarea
                  value={adjustment.reason}
                  onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))}
                  className="min-h-24 w-full rounded-xl border border-gray-800 bg-black px-3 py-3 text-sm font-semibold text-gray-100"
                  placeholder="Ej: Conteo inicial, compra proveedor, merma por vencimiento..."
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAdjustingProduct(null)} className="rounded-xl border border-gray-800 px-4 py-2 text-sm font-bold text-gray-300 hover:bg-gray-900">
                Cancelar
              </button>
              <button onClick={saveAdjustment} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-black hover:bg-emerald-400">
                Guardar ajuste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: any) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase text-gray-500">{label}</p>
        <Icon size={18} className={tone} />
      </div>
      <p className={`mt-3 text-3xl font-black ${tone}`}>{value}</p>
    </div>
  );
}
