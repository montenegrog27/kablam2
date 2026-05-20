"use client";
import { useEffect, useState, useMemo } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Search, ChevronDown, ChevronUp, Download, Calendar, Filter, X, Bike } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  unconfirmed: "Pendiente", confirmed: "Confirmado", preparing: "Preparando",
  ready: "Listo", sent: "Enviado", delivered: "Entregado", cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  unconfirmed: "bg-amber-900/40 text-amber-300",
  confirmed: "bg-blue-900/40 text-blue-300",
  preparing: "bg-orange-900/40 text-orange-300",
  ready: "bg-emerald-900/40 text-emerald-300",
  sent: "bg-purple-900/40 text-purple-300",
  delivered: "bg-green-900/40 text-green-300",
  cancelled: "bg-red-900/40 text-red-300",
};

export default function VentasPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const PAGE_SIZE = 25;

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [riderFilter, setRiderFilter] = useState("");
  const [couponFilter, setCouponFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const tenantIdRef = useMemo(() => ({ current: "" }), []);

  const riderMap = useMemo(() => Object.fromEntries(riders.map((r) => [r.id, r.name])), [riders]);
  const couponMap = useMemo(() => Object.fromEntries(coupons.map((c) => [c.id, c.code])), [coupons]);

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [page, dateFrom, dateTo, statusFilter, typeFilter, paymentFilter, riderFilter, couponFilter, search]);

  const loadMeta = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r) return;
    tenantIdRef.current = r.tenant_id;

    const [{ data: pm }, { data: rd }, { data: cp }] = await Promise.all([
      supabase.from("payment_methods").select("*").eq("is_active", true).or(`tenant_id.eq.${r.tenant_id},tenant_id.is.null`),
      supabase.from("riders").select("*").eq("branch_id", r.branch_id).eq("is_active", true).order("name"),
      supabase.from("coupons").select("id, code"),
    ]);
    setPaymentMethods(pm || []);
    setRiders(rd || []);
    setCoupons(cp || []);
  };

  const load = async () => {
    setLoading(true);
    const tenantId = tenantIdRef.current;
    if (!tenantId) { setLoading(false); return; }

    let query = supabase.from("orders").select("*, order_items(*), order_payments(*)", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);
    if (typeFilter) query = query.eq("type", typeFilter);
    if (paymentFilter) query = query.eq("order_payments.payment_method_id", paymentFilter);
    if (riderFilter === "__none__") query = query.is("rider_id", null);
    else if (riderFilter) query = query.eq("rider_id", riderFilter);
    if (couponFilter === "with") query = query.not("coupon_id", "is", null);
    else if (couponFilter === "without") query = query.is("coupon_id", null);
    if (statusFilter.length > 0) query = query.in("status", statusFilter);
    if (search) query = query.or(`customer_name.ilike.%${search}%,id.ilike.%${search}%`);

    const { data, count } = await query;
    setOrders(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  };

  const toggleStatus = (s: string) => {
    setStatusFilter((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    setPage(0);
  };

  const resetFilters = () => {
    const d = new Date(); d.setDate(1);
    setDateFrom(d.toISOString().split("T")[0]);
    setDateTo(new Date().toISOString().split("T")[0]);
    setStatusFilter([]); setTypeFilter(""); setPaymentFilter(""); setRiderFilter(""); setCouponFilter("");
    setSearch(""); setPage(0);
  };

  const hasActiveFilters = statusFilter.length > 0 || typeFilter || paymentFilter || riderFilter || couponFilter || search;

  // Summary calculations
  const subtotalSum = orders.reduce((s, o) => s + Number(o.subtotal || o.total), 0);
  const shippingSum = orders.reduce((s, o) => s + Number(o.shipping_cost || 0), 0);
  const totalSum = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalPaid = orders.filter((o) => o.is_paid).reduce((s, o) => s + Number(o.total), 0);
  const deliveryCount = orders.filter((o) => o.type === "delivery").length;
  const takeawayCount = orders.filter((o) => o.type === "takeaway").length;
  const pedidosyaCount = orders.filter((o) => o.type === "pedidosya").length;
  const couponCount = orders.filter((o) => o.coupon_id).length;
  const deliveryShippingSum = orders.filter((o) => o.type === "delivery").reduce((s, o) => s + Number(o.shipping_cost || 0), 0);

  const exportCSV = () => {
    const headers = ["ID", "Cliente", "Tipo", "Estado", "Items", "Cupón", "Subtotal", "Envío", "Total", "Repartidor", "Pago", "Pagado", "Fecha"];
    const rows = orders.map((o) => [
      o.id.slice(-8), o.customer_name || "", o.type, o.status,
      o.order_items?.length || 0, couponMap[o.coupon_id] || "",
      Number(o.subtotal || o.total), Number(o.shipping_cost || 0), Number(o.total),
      riderMap[o.rider_id] || "", (o.order_payments?.[0]?.payment_method_id) || "",
      o.is_paid ? "Sí" : "No", new Date(o.created_at).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `ventas_${dateFrom}_${dateTo}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const allStatuses = ["unconfirmed", "confirmed", "preparing", "ready", "sent", "delivered", "cancelled"];
  const orderTypes = ["", "delivery", "takeaway", "pedidosya"];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Ventas</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalCount} pedidos · {couponCount} con cupón</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition border ${
              showFilters || hasActiveFilters ? "bg-blue-600/20 text-blue-300 border-blue-600/30" : "bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800"
            }`}>
            <Filter size={14} /> Filtros {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-blue-400" />}
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-gray-300 border border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-800 transition">
            <Download size={14} /> Exportar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {[
          { label: "Total recaudado", value: `$${totalSum.toLocaleString("es-AR")}`, color: "text-emerald-400" },
          { label: "Sin envío", value: `$${(totalSum - shippingSum).toLocaleString("es-AR")}`, color: "text-emerald-400" },
          { label: "Ganancia envíos", value: `$${deliveryShippingSum.toLocaleString("es-AR")}`, color: "text-blue-400" },
          { label: "Cobrado", value: `$${totalPaid.toLocaleString("es-AR")}`, color: "text-green-400" },
          { label: "Pedidos", value: orders.length.toString(), color: "text-blue-400" },
          { label: "Delivery", value: deliveryCount.toString(), color: "text-purple-400" },
          { label: "Takeaway", value: takeawayCount.toString(), color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters Panel */}
      {(showFilters || hasActiveFilters) && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-100">Filtros</h3>
            <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1">
              <X size={12} /> Limpiar filtros
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Calendar size={14} className="text-gray-500 flex-shrink-0" />
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="border border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-gray-800 text-gray-100" />
            <span className="text-gray-500">→</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="border border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-gray-800 text-gray-100" />
            {["today", "week", "month"].map((p) => {
              const setPreset = () => {
                const now = new Date();
                if (p === "today") { setDateFrom(now.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); }
                else if (p === "week") { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); setDateFrom(d.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); }
                else { const d = new Date(now); d.setDate(1); setDateFrom(d.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); }
                setPage(0);
              };
              return <button key={p} onClick={setPreset} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-gray-200">{p === "today" ? "Hoy" : p === "week" ? "Semana" : "Mes"}</button>;
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs text-gray-500 mb-1.5">Estado</label>
              <div className="flex flex-wrap gap-1.5">
                {allStatuses.map((s) => (
                  <button key={s} onClick={() => toggleStatus(s)}
                    className={`text-[10px] px-2 py-1 rounded-full font-medium transition ${
                      statusFilter.includes(s) ? STATUS_COLORS[s] + " ring-1 ring-white/20" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                    }`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Tipo</label>
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                <option value="">Todos</option>
                <option value="delivery">Delivery</option>
                <option value="takeaway">Takeaway</option>
                <option value="pedidosya">PedidosYa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Repartidor</label>
              <select value={riderFilter} onChange={(e) => { setRiderFilter(e.target.value); setPage(0); }}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                <option value="">Todos</option>
                <option value="__none__">Sin asignar</option>
                {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Cupón</label>
              <select value={couponFilter} onChange={(e) => { setCouponFilter(e.target.value); setPage(0); }}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                <option value="">Todos</option>
                <option value="with">Con cupón</option>
                <option value="without">Sin cupón</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Método de pago</label>
              <select value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setPage(0); }}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                <option value="">Todos</option>
                {paymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select>
            </div>
          </div>

          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full border border-gray-600 rounded-lg pl-8 pr-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500"
              placeholder="Buscar cliente o ID..." />
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        {/* Table header - scrollable horizontally on mobile */}
        <div className="overflow-x-auto">
          <div className="min-w-[1000px] grid grid-cols-12 gap-1 px-4 py-3 border-b border-gray-700 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-2">Pedido</div>
            <div className="col-span-2">Cliente</div>
            <div className="col-span-1">Tipo</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-1 text-right">Items</div>
            <div className="col-span-1">Cupón</div>
            <div className="col-span-1 text-right">Envío</div>
            <div className="col-span-1 text-right">Subtotal</div>
            <div className="col-span-1 text-right">Total</div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No hay ventas en este período</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {orders.map((order) => {
              const payment = order.order_payments?.[0];
              const pm = paymentMethods.find((m) => m.id === payment?.payment_method_id);
              const isExpanded = expandedId === order.id;
              const shippable = order.type === "delivery";
              return (
                <div key={order.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    className="overflow-x-auto cursor-pointer hover:bg-gray-800/30 transition"
                  >
                    <div className="min-w-[1000px] grid grid-cols-12 gap-1 px-4 py-3 items-center">
                      <div className="col-span-2 flex items-center gap-1.5">
                        {isExpanded ? <ChevronUp size={12} className="text-gray-600 flex-shrink-0" /> : <ChevronDown size={12} className="text-gray-600 flex-shrink-0" />}
                        <span className="text-xs font-medium text-gray-100">#{order.id.slice(-8).toUpperCase()}</span>
                      </div>
                      <div className="col-span-2 text-xs text-gray-300 truncate flex items-center gap-1">
                        {order.customer_name || "—"}
                        {riderMap[order.rider_id] && <span className="text-[10px] text-gray-600" title={riderMap[order.rider_id]}>🚴</span>}
                      </div>
                      <div className="col-span-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          order.type === "delivery" ? "bg-purple-900/30 text-purple-300" :
                          order.type === "pedidosya" ? "bg-pink-900/30 text-pink-300" :
                          "bg-amber-900/30 text-amber-300"
                        }`}>
                          {order.type === "delivery" ? "D" : order.type === "pedidosya" ? "P" : "T"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] || "bg-gray-800 text-gray-400"}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </div>
                      <div className="col-span-1 text-xs text-gray-400 text-right tabular-nums">{order.order_items?.length || 0}</div>
                      <div className="col-span-1 text-xs">
                        {couponMap[order.coupon_id] ? (
                          <span className="text-emerald-400 font-medium">{couponMap[order.coupon_id]}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </div>
                      <div className="col-span-1 text-xs text-right tabular-nums">
                        {shippable ? (
                          <span className="text-gray-400">${Number(order.shipping_cost || 0).toLocaleString("es-AR")}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </div>
                      <div className="col-span-1 text-xs text-right tabular-nums text-gray-300">
                        ${Number(order.subtotal || order.total).toLocaleString("es-AR")}
                      </div>
                      <div className="col-span-1 text-xs font-semibold text-gray-100 text-right tabular-nums">
                        ${Number(order.total).toLocaleString("es-AR")}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="bg-gray-950/50 border-t border-gray-800 px-4 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Productos</p>
                          <div className="space-y-1">
                            {(order.order_items || []).map((item: any) => (
                              <div key={item.id} className="flex items-center justify-between text-xs">
                                <span className="text-gray-300">{item.quantity}x {item.products?.name || "Producto"}</span>
                                <span className="text-gray-400 tabular-nums">${Number(item.total).toLocaleString("es-AR")}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Detalle</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-gray-500">Fecha</span><span className="text-gray-300">{new Date(order.created_at).toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Tipo</span><span className="text-gray-300 capitalize">{order.type === "takeaway" ? "Retiro" : order.type === "delivery" ? "Delivery" : "PedidosYa"}</span></div>
                            {order.address && <div className="flex justify-between"><span className="text-gray-500">Dirección</span><span className="text-gray-300 text-right max-w-[180px] truncate">{order.address}</span></div>}
                            {riderMap[order.rider_id] && <div className="flex justify-between"><span className="text-gray-500">Repartidor</span><span className="text-gray-300">{riderMap[order.rider_id]}</span></div>}
                            <div className="flex justify-between"><span className="text-gray-500">Pago</span><span className="text-gray-300">{pm?.name || "—"}{order.is_paid ? " ✓" : ""}</span></div>
                            {couponMap[order.coupon_id] && <div className="flex justify-between"><span className="text-gray-500">Cupón</span><span className="text-emerald-400">{couponMap[order.coupon_id]}</span></div>}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Totales</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="text-gray-300">${Number(order.subtotal || order.total).toLocaleString("es-AR")}</span></div>
                            {Number(order.shipping_cost) > 0 && <div className="flex justify-between"><span className="text-gray-500">Envío</span><span className="text-gray-300">+${Number(order.shipping_cost).toLocaleString("es-AR")}</span></div>}
                            {Number(order.discount) > 0 && <div className="flex justify-between"><span className="text-gray-500">Descuento</span><span className="text-emerald-400">-${Number(order.discount).toLocaleString("es-AR")}</span></div>}
                            <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5"><span className="text-gray-100 font-semibold">Total</span><span className="text-gray-100 font-bold">${Number(order.total).toLocaleString("es-AR")}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
            <span className="text-xs text-gray-500">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 transition">Anterior</button>
              <button onClick={() => setPage(page + 1)} disabled={(page + 1) * PAGE_SIZE >= totalCount}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
