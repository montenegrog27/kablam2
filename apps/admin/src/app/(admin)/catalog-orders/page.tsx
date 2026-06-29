"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Filter,
  PackageCheck,
  Phone,
  Search,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";

type CatalogOrder = {
  id: string;
  tenant_id: string;
  branch_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  requested_date: string | null;
  notes: string | null;
  deposit_required: boolean | null;
  deposit_percent: number | null;
  deposit_amount: number | null;
  transfer_alias: string | null;
  status: string | null;
  customer_whatsapp_sent: boolean | null;
  branch_whatsapp_sent: boolean | null;
  created_at: string;
  updated_at: string | null;
  fulfillment_type: string | null;
  pickup_address: string | null;
  raw: Record<string, any> | null;
  branches?: { name?: string | null; slug?: string | null } | null;
};

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "En preparacion",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  preparing: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  delivered: "border-green-500/30 bg-green-500/10 text-green-200",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-200",
};

function todayArgentina() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function startOfMonthArgentina() {
  const today = todayArgentina();
  return `${today.slice(0, 8)}01`;
}

function dateToUtcStart(date: string) {
  return new Date(`${date}T00:00:00-03:00`).toISOString();
}

function dateToUtcEnd(date: string) {
  return new Date(`${date}T23:59:59.999-03:00`).toISOString();
}

function money(value: number | null | undefined) {
  return `$${Math.round(Number(value || 0)).toLocaleString("es-AR")}`;
}

function isPaid(order: CatalogOrder) {
  return order.raw?.payment_status === "paid" || Boolean(order.raw?.paid_at);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(`${value}T12:00:00-03:00`).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CatalogOrdersPage() {
  const [orders, setOrders] = useState<CatalogOrder[]>([]);
  const [summaryOrders, setSummaryOrders] = useState<CatalogOrder[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const [dateFrom, setDateFrom] = useState(startOfMonthArgentina);
  const [dateTo, setDateTo] = useState(todayArgentina);
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [search, setSearch] = useState("");

  const summary = useMemo(() => {
    const revenue = summaryOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const depositTotal = summaryOrders.reduce(
      (sum, order) => sum + (order.deposit_required ? Number(order.deposit_amount || 0) : 0),
      0,
    );
    const paid = summaryOrders.filter(isPaid);
    const pending = summaryOrders.filter((order) => (order.status || "pending") === "pending");
    const delivered = summaryOrders.filter((order) => order.status === "delivered");
    const whatsappOk = summaryOrders.filter((order) => order.customer_whatsapp_sent && order.branch_whatsapp_sent);

    return {
      revenue,
      depositTotal,
      paidRevenue: paid.reduce((sum, order) => sum + Number(order.total || 0), 0),
      pending: pending.length,
      delivered: delivered.length,
      paid: paid.length,
      whatsappOk: whatsappOk.length,
    };
  }, [summaryOrders]);

  const hasFilters = Boolean(
    branchFilter || statusFilter || fulfillmentFilter || paymentFilter || search ||
      dateFrom !== startOfMonthArgentina() || dateTo !== todayArgentina(),
  );

  async function loadMeta() {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;
    setUserId(user.id);

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
      .order("name");

    setBranches(branchRows || []);
  }

  function applyFilters(query: any, includePagination = true) {
    let next = query
      .eq("tenant_id", tenantId)
      .gte("created_at", dateToUtcStart(dateFrom))
      .lte("created_at", dateToUtcEnd(dateTo))
      .order("created_at", { ascending: false });

    if (branchFilter) next = next.eq("branch_id", branchFilter);
    if (statusFilter) next = next.eq("status", statusFilter);
    if (fulfillmentFilter) next = next.eq("fulfillment_type", fulfillmentFilter);
    if (search.trim()) {
      const q = search.trim();
      next = next.or(
        `customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%,product_name.ilike.%${q}%,id.ilike.%${q}%`,
      );
    }
    if (includePagination) {
      next = next.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    }
    return next;
  }

  async function loadOrders() {
    if (!tenantId) return;
    setLoading(true);

    const [pageResult, summaryResult] = await Promise.all([
      applyFilters(
        supabase
          .from("catalog_orders")
          .select("*, branches(name, slug)", { count: "exact" }),
      ),
      applyFilters(
        supabase
          .from("catalog_orders")
          .select("*, branches(name, slug)")
          .range(0, 999),
        false,
      ),
    ]);

    const { data, count, error } = pageResult;

    if (error) {
      console.error("catalog orders load error", error);
      setOrders([]);
      setSummaryOrders([]);
      setTotalCount(0);
    } else {
      let rows = ((data || []) as CatalogOrder[]);
      let summaryRows = ((summaryResult.data || []) as CatalogOrder[]);
      if (paymentFilter === "paid") rows = rows.filter(isPaid);
      if (paymentFilter === "unpaid") rows = rows.filter((order) => !isPaid(order));
      if (paymentFilter === "paid") summaryRows = summaryRows.filter(isPaid);
      if (paymentFilter === "unpaid") summaryRows = summaryRows.filter((order) => !isPaid(order));
      setOrders(rows);
      setSummaryOrders(summaryRows);
      setTotalCount(paymentFilter ? summaryRows.length : count || 0);
    }

    setLoading(false);
  }

  async function updateOrder(order: CatalogOrder, patch: Partial<CatalogOrder>) {
    setSavingId(order.id);
    const { error } = await supabase
      .from("catalog_orders")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("tenant_id", tenantId);

    if (error) {
      alert(`No se pudo actualizar el pedido: ${error.message}`);
    } else {
      await loadOrders();
    }
    setSavingId(null);
  }

  async function markDelivered(order: CatalogOrder) {
    await updateOrder(order, { status: "delivered" });
  }

  async function markPaid(order: CatalogOrder) {
    await updateOrder(order, {
      raw: {
        ...(order.raw || {}),
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        paid_by: userId || null,
      },
    });
  }

  function resetFilters() {
    setDateFrom(startOfMonthArgentina());
    setDateTo(todayArgentina());
    setBranchFilter("");
    setStatusFilter("");
    setFulfillmentFilter("");
    setPaymentFilter("");
    setSearch("");
    setPage(0);
  }

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [tenantId, page, dateFrom, dateTo, branchFilter, statusFilter, fulfillmentFilter, paymentFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold uppercase text-violet-200">
            <ShoppingBag size={14} />
            Catalogo web
          </div>
          <h1 className="text-3xl font-black tracking-tight text-gray-50">Pedidos de Catalogo</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Encargos generados desde la vista <span className="font-semibold text-gray-200">/catalogo</span>. Controla pagos, entregas, WhatsApp y fechas solicitadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowFilters((value) => !value)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${
              showFilters || hasFilters
                ? "border-violet-500/40 bg-violet-500/15 text-violet-100"
                : "border-gray-800 bg-gray-900 text-gray-300 hover:border-gray-700"
            }`}
          >
            <Filter size={16} />
            Filtros
            {hasFilters ? <span className="h-2 w-2 rounded-full bg-violet-300" /> : null}
          </button>
          <button
            onClick={loadOrders}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-300 hover:border-gray-700"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Pedidos" value={totalCount.toString()} icon={ShoppingBag} tone="text-sky-300" />
        <KpiCard label="Pendientes" value={summary.pending.toString()} icon={Clock3} tone="text-amber-300" />
        <KpiCard label="Entregados" value={summary.delivered.toString()} icon={PackageCheck} tone="text-emerald-300" />
        <KpiCard label="Pagados" value={summary.paid.toString()} icon={CreditCard} tone="text-green-300" />
        <KpiCard label="Total listado" value={money(summary.revenue)} icon={CheckCircle2} tone="text-violet-300" />
        <KpiCard label="Senas" value={money(summary.depositTotal)} icon={Truck} tone="text-cyan-300" />
      </div>

      {(showFilters || hasFilters) && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wide text-gray-100">Filtros</h2>
            <button onClick={resetFilters} className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-gray-200">
              <X size={14} />
              Limpiar
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Desde">
              <input className="input" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} />
            </Field>
            <Field label="Hasta">
              <input className="input" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} />
            </Field>
            <Field label="Sucursal">
              <select className="input" value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(0); }}>
                <option value="">Todas</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Estado">
              <select className="input" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                <option value="">Todos</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Entrega">
              <select className="input" value={fulfillmentFilter} onChange={(e) => { setFulfillmentFilter(e.target.value); setPage(0); }}>
                <option value="">Todas</option>
                <option value="delivery">Delivery</option>
                <option value="pickup">Retiro</option>
                <option value="coordinate">A coordinar</option>
              </select>
            </Field>
            <Field label="Pago">
              <select className="input" value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setPage(0); }}>
                <option value="">Todos</option>
                <option value="paid">Pagados</option>
                <option value="unpaid">No pagados</option>
              </select>
            </Field>
          </div>

          <div className="mt-3 max-w-xl">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className="input pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Buscar por cliente, telefono, producto o ID..."
              />
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-100">Detalle de pedidos</h2>
          <p className="mt-1 text-xs text-gray-500">Mostrando {orders.length} pedidos de esta pagina.</p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Cargando pedidos...</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center">
            <ShoppingBag className="mx-auto mb-3 text-gray-600" size={32} />
            <p className="font-bold text-gray-300">No hay pedidos de catalogo para estos filtros.</p>
            <p className="mt-1 text-sm text-gray-500">Cuando un cliente compre desde /catalogo, va a aparecer aca.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {orders.map((order) => {
              const paid = isPaid(order);
              const status = order.status || "pending";
              const saving = savingId === order.id;
              return (
                <article key={order.id} className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${STATUS_CLASSES[status] || "border-gray-700 bg-gray-800 text-gray-300"}`}>
                        {STATUS_LABELS[status] || status}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${
                        paid ? "border-green-500/30 bg-green-500/10 text-green-200" : "border-gray-700 bg-gray-950 text-gray-400"
                      }`}>
                        {paid ? "Pagado" : "Sin pago"}
                      </span>
                      <span className="rounded-full border border-gray-700 bg-gray-950 px-2.5 py-1 text-[11px] font-bold uppercase text-gray-400">
                        {order.fulfillment_type === "pickup" ? "Retiro" : order.fulfillment_type === "coordinate" ? "A coordinar" : "Delivery"}
                      </span>
                    </div>
                    <h3 className="truncate text-base font-black text-gray-100">{order.product_name}</h3>
                    <p className="mt-1 text-sm text-gray-400">
                      {order.customer_name} · <span className="font-mono">{order.customer_phone}</span>
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={14} />
                        Solicitado: <strong className="text-gray-300">{formatDate(order.requested_date)}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={14} />
                        Creado: <strong className="text-gray-300">{formatDateTime(order.created_at)}</strong>
                      </span>
                      <span className="sm:col-span-2">
                        {order.fulfillment_type === "pickup" ? order.pickup_address : order.delivery_address || "Sin direccion"}
                      </span>
                      {order.notes ? <span className="sm:col-span-2 text-gray-400">Nota: {order.notes}</span> : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-800 bg-gray-950 p-3 text-sm">
                    <Info label="Total" value={money(order.total)} strong />
                    <Info label="Cantidad" value={`${order.quantity || 1} u.`} />
                    <Info label="Sena" value={order.deposit_required ? money(order.deposit_amount) : "No requiere"} />
                    <Info label="WhatsApp" value={order.customer_whatsapp_sent && order.branch_whatsapp_sent ? "Enviado" : "Revisar"} />
                    <Info label="Sucursal" value={order.branches?.name || "-"} />
                    <Info label="Alias" value={order.transfer_alias || "-"} />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row lg:w-40 lg:flex-col">
                    <button
                      onClick={() => markPaid(order)}
                      disabled={saving || paid}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-black text-gray-950 transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CreditCard size={16} />
                      Pagado
                    </button>
                    <button
                      onClick={() => markDelivered(order)}
                      disabled={saving || status === "delivered"}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-gray-950 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <PackageCheck size={16} />
                      Entregado
                    </button>
                    <a
                      href={`https://wa.me/${order.customer_phone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 px-4 py-2 text-sm font-bold text-gray-300 transition hover:border-gray-500 hover:text-white"
                    >
                      <Phone size={16} />
                      WhatsApp
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-800 px-4 py-3">
            <p className="text-xs text-gray-500">
              {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-300 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((value) => value + 1)}
                disabled={(page + 1) * PAGE_SIZE >= totalCount}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-300 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: any;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className={`mb-3 inline-flex rounded-xl bg-gray-950 p-2 ${tone}`}>
        <Icon size={18} />
      </div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 truncate text-xl font-black text-gray-100">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-600">{label}</p>
      <p className={`mt-0.5 truncate ${strong ? "text-base font-black text-gray-100" : "font-semibold text-gray-300"}`}>
        {value}
      </p>
    </div>
  );
}
