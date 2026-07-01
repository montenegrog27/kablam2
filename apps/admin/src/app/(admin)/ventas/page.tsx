"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState, useMemo } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Search, ChevronDown, ChevronUp, Download, Calendar, Filter, X, Trash2 } from "lucide-react";

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

const SALE_STATUSES = ["delivered", "sent", "ready", "confirmed", "preparing"];
const ARGENTINA_OFFSET = "-03:00";
const MIN_OVERNIGHT_REPORT_END = 90;

type BranchHour = {
  branch_id: string;
  day_of_week: number;
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean | null;
};

function argentinaDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addLocalDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().split("T")[0];
}

function dayOfWeek(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToUtcIso(dateStr: string, absoluteMinutes: number) {
  const date = addLocalDays(dateStr, Math.floor(absoluteMinutes / 1440));
  const minutes = ((absoluteMinutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return new Date(`${date}T${hour}:${minute}:00${ARGENTINA_OFFSET}`).toISOString();
}

function buildBusinessWindow(dateStr: string, branchHours: BranchHour[]) {
  const ranges = branchHours
    .filter((hour) => Number(hour.day_of_week) === dayOfWeek(dateStr) && !hour.is_closed)
    .map((hour) => {
      const open = timeToMinutes(hour.open_time);
      const close = timeToMinutes(hour.close_time);
      if (open === null || close === null) return null;
      const crossesMidnight = close <= open;
      return {
        open,
        close: crossesMidnight ? Math.max(close + 1440, 1440 + MIN_OVERNIGHT_REPORT_END) : close,
      };
    })
    .filter((range): range is { open: number; close: number } => Boolean(range));

  if (ranges.length === 0) {
    return {
      start: minutesToUtcIso(dateStr, 0),
      end: minutesToUtcIso(dateStr, 1440),
      label: "00:00 a 00:00",
      usesBusinessHours: false,
    };
  }

  const startMinutes = Math.min(...ranges.map((range) => range.open));
  const endMinutes = Math.max(...ranges.map((range) => range.close));
  const startLabel = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
  const endLocalMinutes = endMinutes % 1440;
  const endLabel = `${String(Math.floor(endLocalMinutes / 60)).padStart(2, "0")}:${String(endLocalMinutes % 60).padStart(2, "0")}`;

  return {
    start: minutesToUtcIso(dateStr, startMinutes),
    end: minutesToUtcIso(dateStr, endMinutes),
    label: `${startLabel} a ${endLabel}${endMinutes >= 1440 ? " del dia siguiente" : ""}`,
    usesBusinessHours: true,
  };
}

function getBusinessWindowStartLabel(label: string) {
  return label.split(" a ")[0] || label;
}

function getBusinessWindowEndLabel(label: string) {
  const end = label.split(" a ")[1] || label;
  return end.replace(" del dia siguiente", "");
}

export default function VentasPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [branchHours, setBranchHours] = useState<BranchHour[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [periodSummary, setPeriodSummary] = useState({
    subtotal: 0,
    shipping: 0,
    total: 0,
    paid: 0,
    delivery: 0,
    takeaway: 0,
    pedidosya: 0,
    coupons: 0,
    deliveryShipping: 0,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const PAGE_SIZE = 25;
  const SUMMARY_PAGE_SIZE = 1000;

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const today = argentinaDateString();
    return `${today.slice(0, 8)}01`;
  });
  const [dateTo, setDateTo] = useState(() => argentinaDateString());
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [riderFilter, setRiderFilter] = useState("");
  const [couponFilter, setCouponFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const riderMap = useMemo(() => Object.fromEntries(riders.map((r) => [r.id, r.name])), [riders]);
  const couponMap = useMemo(() => Object.fromEntries(coupons.map((c) => [c.id, c.code])), [coupons]);
  const businessRange = useMemo(() => {
    const startWindow = dateFrom ? buildBusinessWindow(dateFrom, branchHours) : null;
    const endWindow = dateTo ? buildBusinessWindow(dateTo, branchHours) : null;
    return {
      start: startWindow?.start || null,
      end: endWindow?.end || null,
      label: startWindow && endWindow
        ? dateFrom === dateTo
          ? startWindow.label
          : `${dateFrom} ${getBusinessWindowStartLabel(startWindow.label)} -> ${dateTo} ${getBusinessWindowEndLabel(endWindow.label)}`
        : "",
      usesBusinessHours: Boolean(startWindow?.usesBusinessHours || endWindow?.usesBusinessHours),
    };
  }, [dateFrom, dateTo, branchHours]);

  const loadMeta = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id, role").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);
    setUserRole(r.role || "");

    const [{ data: pm }, { data: rd }, { data: cp }, { data: branches }] = await Promise.all([
      supabase.from("payment_methods").select("*").eq("is_active", true).or(`tenant_id.eq.${r.tenant_id},tenant_id.is.null`),
      supabase.from("riders").select("*").eq("branch_id", r.branch_id).eq("is_active", true).order("name"),
      supabase.from("coupons").select("id, code"),
      supabase.from("branches").select("id").eq("tenant_id", r.tenant_id),
    ]);
    setPaymentMethods(pm || []);
    setRiders(rd || []);
    setCoupons(cp || []);
    const branchIds = (branches || []).map((branch: any) => branch.id);
    if (branchIds.length > 0) {
      const { data: hours } = await supabase
        .from("branch_hours")
        .select("branch_id, day_of_week, open_time, close_time, is_closed")
        .in("branch_id", branchIds);
      setBranchHours((hours || []) as BranchHour[]);
    }
  };

  const applyFilters = (query: any) => {
    let next = query
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (businessRange.start) next = next.gte("created_at", businessRange.start);
    if (businessRange.end) next = next.lt("created_at", businessRange.end);
    if (typeFilter) next = next.eq("type", typeFilter);
    if (paymentFilter) next = next.eq("order_payments.payment_method_id", paymentFilter);
    if (riderFilter === "__none__") next = next.is("rider_id", null);
    else if (riderFilter) next = next.eq("rider_id", riderFilter);
    if (statusFilter.length > 0) next = next.in("status", statusFilter);
    else next = next.in("status", SALE_STATUSES);
    if (search) next = next.or(`customer_name.ilike.%${search}%,id.ilike.%${search}%`);

    return next;
  };

  const loadPeriodSummary = async () => {
    const totals = {
      subtotal: 0,
      shipping: 0,
      total: 0,
      paid: 0,
      delivery: 0,
      takeaway: 0,
      pedidosya: 0,
      coupons: 0,
      deliveryShipping: 0,
    };

    let from = 0;

    while (true) {
      const select = paymentFilter
        ? "id, subtotal, shipping_cost, total, is_paid, type, order_payments!inner(payment_method_id)"
        : "id, subtotal, shipping_cost, total, is_paid, type, order_payments(payment_method_id)";
      const { data, error } = await applyFilters(
        supabase.from("orders").select(select).range(from, from + SUMMARY_PAGE_SIZE - 1),
      );

      if (error) throw error;
      const rows = data || [];

      rows.forEach((order: any) => {
        const total = Number(order.total || 0);
        const shipping = Number(order.shipping_cost || 0);
        const saleTotal = Math.max(0, total - shipping);
        totals.subtotal += Number(order.subtotal || total);
        totals.shipping += shipping;
        totals.total += saleTotal;
        if (order.is_paid) totals.paid += saleTotal;
        if (order.type === "delivery") {
          totals.delivery += 1;
          totals.deliveryShipping += shipping;
        }
        if (order.type === "takeaway") totals.takeaway += 1;
        if (order.type === "pedidosya") totals.pedidosya += 1;
      });

      if (rows.length < SUMMARY_PAGE_SIZE) break;
      from += SUMMARY_PAGE_SIZE;
    }

    setPeriodSummary(totals);
  };

  const load = async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);

    const pageSelect = paymentFilter
      ? "*, order_items(*), order_payments!inner(*)"
      : "*, order_items(*), order_payments(*)";
    const pageQuery = applyFilters(
      supabase
        .from("orders")
        .select(pageSelect, { count: "exact" })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
    );

    const [{ data, count }] = await Promise.all([pageQuery, loadPeriodSummary()]);
    setOrders(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [tenantId, page, dateFrom, dateTo, branchHours, statusFilter, typeFilter, paymentFilter, riderFilter, couponFilter, search]);

  const toggleStatus = (s: string) => {
    setStatusFilter((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    setPage(0);
  };

  const resetFilters = () => {
    const today = argentinaDateString();
    setDateFrom(`${today.slice(0, 8)}01`);
    setDateTo(today);
    setStatusFilter([]); setTypeFilter(""); setPaymentFilter(""); setRiderFilter(""); setCouponFilter("");
    setSearch(""); setPage(0);
  };

  const hasActiveFilters = statusFilter.length > 0 || typeFilter || paymentFilter || riderFilter || search;

  // Summary calculations
  const shippingSum = periodSummary.shipping;
  const totalSum = periodSummary.total;
  const totalPaid = periodSummary.paid;
  const deliveryCount = periodSummary.delivery;
  const takeawayCount = periodSummary.takeaway;
  const couponCount = periodSummary.coupons;
  const deliveryShippingSum = periodSummary.deliveryShipping;

  const exportCSV = () => {
    const headers = ["ID", "Cliente", "Tipo", "Estado", "Items", "Cupon", "Subtotal", "Envio", "Venta sin envio", "Repartidor", "Pago", "Pagado", "Fecha"];
    const rows = orders.map((o) => [
      o.id.slice(-8), o.customer_name || "", o.type, o.status,
      o.order_items?.length || 0, couponMap[o.coupon_id] || "",
      Number(o.subtotal || o.total), Number(o.shipping_cost || 0), Math.max(0, Number(o.total || 0) - Number(o.shipping_cost || 0)),
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
  const canDeleteSales = userRole === "owner";

  const deleteOrder = async (order: any) => {
    if (!canDeleteSales || deletingId) return;

    const label = `#${order.id.slice(-8).toUpperCase()} - ${order.customer_name || "sin cliente"}`;
    if (!confirm(`Eliminar la venta ${label}? Esta accion borra la orden y sus items/pagos. No se puede deshacer.`)) return;

    setDeletingId(order.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("No hay sesion activa.");

      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.details || result.error || "No se pudo eliminar la venta.");

      if (expandedId === order.id) setExpandedId(null);
      await load();
    } catch (error: any) {
      alert("No se pudo eliminar la venta: " + error.message);
    } finally {
      setDeletingId("");
    }
  };

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
          { label: "Venta sin envio", value: `$${totalSum.toLocaleString("es-AR")}`, color: "text-emerald-400" },
          { label: "Envios", value: `$${shippingSum.toLocaleString("es-AR")}`, color: "text-cyan-400" },
          { label: "Envio delivery", value: `$${deliveryShippingSum.toLocaleString("es-AR")}`, color: "text-blue-400" },
          { label: "Cobrado sin envio", value: `$${totalPaid.toLocaleString("es-AR")}`, color: "text-green-400" },
          { label: "Pedidos", value: totalCount.toString(), color: "text-blue-400" },
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
                const today = argentinaDateString();
                if (p === "today") {
                  setDateFrom(today);
                  setDateTo(today);
                } else if (p === "week") {
                  const [year, month, day] = today.split("-").map(Number);
                  const localToday = new Date(Date.UTC(year, month - 1, day));
                  const weekStart = addLocalDays(today, -localToday.getUTCDay());
                  setDateFrom(weekStart);
                  setDateTo(today);
                } else {
                  setDateFrom(`${today.slice(0, 8)}01`);
                  setDateTo(today);
                }
                setPage(0);
              };
              return <button key={p} onClick={setPreset} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-gray-200">{p === "today" ? "Hoy" : p === "week" ? "Semana" : "Mes"}</button>;
            })}
          </div>
          <div className="text-xs text-gray-500">
            Rango operativo contado: <span className="font-semibold text-gray-300">{businessRange.label || "sin rango"}</span>
            {!businessRange.usesBusinessHours && <span> (sin horarios de sucursal configurados)</span>}
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
          <div className="min-w-[1080px] grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1 px-4 py-3 border-b border-gray-700 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-2">Pedido</div>
            <div className="col-span-2">Cliente</div>
            <div className="col-span-1">Tipo</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-1 text-right">Items</div>
            <div className="col-span-1">Cupón</div>
            <div className="col-span-1 text-right">Envío</div>
            <div className="col-span-1 text-right">Subtotal</div>
            <div className="col-span-1 text-right">Venta</div>
            <div className="col-span-1 text-right">Acciones</div>
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
                    <div className="min-w-[1080px] grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1 px-4 py-3 items-center">
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
                        ${Math.max(0, Number(order.total || 0) - Number(order.shipping_cost || 0)).toLocaleString("es-AR")}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {canDeleteSales ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteOrder(order);
                            }}
                            disabled={deletingId === order.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-[11px] font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                            title="Eliminar venta"
                          >
                            <Trash2 size={12} />
                            {deletingId === order.id ? "..." : "Eliminar"}
                          </button>
                        ) : (
                          <span className="text-gray-700">-</span>
                        )}
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
                            <div className="flex justify-between"><span className="text-gray-500">Total cobrado</span><span className="text-gray-300">${Number(order.total).toLocaleString("es-AR")}</span></div>
                            <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5"><span className="text-gray-100 font-semibold">Venta sin envio</span><span className="text-gray-100 font-bold">${Math.max(0, Number(order.total || 0) - Number(order.shipping_cost || 0)).toLocaleString("es-AR")}</span></div>
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
