"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  DollarSign,
  Package,
  RefreshCw,
  ShoppingBag,
  Target,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

const SALE_STATUSES = ["delivered", "sent", "ready", "confirmed", "preparing"];
const TIME_ZONE = "America/Argentina/Buenos_Aires";

type Branch = {
  id: string;
  name: string;
};

type DashboardOrder = {
  id: string;
  branch_id?: string | null;
  created_at: string;
  customer_id?: string | null;
  customer_name?: string | null;
  type?: string | null;
  status?: string | null;
  subtotal?: number | null;
  shipping_cost?: number | null;
  discount?: number | null;
  discount_amount?: number | null;
  total?: number | null;
  is_paid?: boolean | null;
  order_items?: Array<{
    quantity?: number | null;
    total?: number | null;
    products?: { name?: string | null } | null;
    combos?: { name?: string | null } | null;
    extras?: any;
  }>;
  order_payments?: Array<{
    amount?: number | null;
    payment_methods?: { name?: string | null } | null;
  }>;
};

type Summary = {
  orders: number;
  netSales: number;
  shipping: number;
  grossTotal: number;
  discounts: number;
  avgTicket: number;
  paid: number;
  unpaid: number;
  delivery: number;
  takeaway: number;
  pedidosya: number;
  customers: number;
};

function argentinaDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addLocalDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function monthStart(dateStr: string) {
  return `${dateStr.slice(0, 8)}01`;
}

function nextMonthStart(dateStr: string) {
  const [year, month] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function prevMonthStart(dateStr: string) {
  const [year, month] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
}

function daysInMonth(dateStr: string) {
  const [year, month] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toArgentinaIso(dateStr: string, endOfDay = false) {
  return new Date(`${dateStr}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}-03:00`).toISOString();
}

function formatMoney(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-AR")}`;
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function pctChange(current: number, previous: number) {
  if (!previous && current) return 100;
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function summarize(orders: DashboardOrder[]): Summary {
  const customerIds = new Set<string>();
  const summary = orders.reduce(
    (acc, order) => {
      const grossTotal = Number(order.total || 0);
      const shipping = Number(order.shipping_cost || 0);
      const netSale = Math.max(0, grossTotal - shipping);
      const discount = Number(order.discount_amount ?? order.discount ?? 0);

      acc.orders += 1;
      acc.netSales += netSale;
      acc.shipping += shipping;
      acc.grossTotal += grossTotal;
      acc.discounts += discount;
      if (order.is_paid) acc.paid += netSale;
      else acc.unpaid += netSale;
      if (order.type === "delivery") acc.delivery += 1;
      else if (order.type === "pedidosya") acc.pedidosya += 1;
      else acc.takeaway += 1;
      if (order.customer_id) customerIds.add(order.customer_id);
      return acc;
    },
    {
      orders: 0,
      netSales: 0,
      shipping: 0,
      grossTotal: 0,
      discounts: 0,
      avgTicket: 0,
      paid: 0,
      unpaid: 0,
      delivery: 0,
      takeaway: 0,
      pedidosya: 0,
      customers: 0,
    },
  );

  summary.avgTicket = summary.orders > 0 ? summary.netSales / summary.orders : 0;
  summary.customers = customerIds.size;
  return summary;
}

function orderLocalDate(order: DashboardOrder) {
  return argentinaDateString(new Date(order.created_at));
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("all");
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [prevMonthOrders, setPrevMonthOrders] = useState<DashboardOrder[]>([]);
  const [error, setError] = useState("");

  const today = argentinaDateString();
  const currentMonthStart = monthStart(today);
  const currentMonthEnd = nextMonthStart(today);
  const previousMonthStart = prevMonthStart(today);
  const previousMonthEnd = currentMonthStart;
  const elapsedDays = Math.max(1, Number(today.slice(-2)));
  const totalMonthDays = daysInMonth(today);
  const remainingDays = Math.max(0, totalMonthDays - elapsedDays);

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (tenantId) loadOrders();
  }, [branchId, tenantId]);

  const loadDashboard = async () => {
    setLoading(true);
    setError("");

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: userRecord, error: userError } = await supabase
      .from("users")
      .select("tenant_id, branch_id, role, tenants(*)")
      .eq("id", user.id)
      .single();

    if (userError || !userRecord) {
      setError(userError?.message || "No se pudo cargar el usuario.");
      setLoading(false);
      return;
    }

    setTenant(userRecord.tenants);
    setUserRole(userRecord.role);
    setTenantId(userRecord.tenant_id);

    const { data: branchRows } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    setBranches(branchRows || []);
    setBranchId(userRecord.branch_id || "all");
  };

  const loadOrders = async () => {
    setLoading(true);
    setError("");

    const baseSelect = `
      id,
      branch_id,
      created_at,
      customer_id,
      customer_name,
      type,
      status,
      subtotal,
      shipping_cost,
      discount,
      discount_amount,
      total,
      is_paid,
      order_items(quantity, total, extras, products(name), combos(name)),
      order_payments(amount, payment_methods(name))
    `;

    let currentQuery = supabase
      .from("orders")
      .select(baseSelect)
      .eq("tenant_id", tenantId)
      .in("status", SALE_STATUSES)
      .gte("created_at", toArgentinaIso(currentMonthStart))
      .lt("created_at", toArgentinaIso(currentMonthEnd))
      .order("created_at", { ascending: false });

    let previousQuery = supabase
      .from("orders")
      .select(baseSelect)
      .eq("tenant_id", tenantId)
      .in("status", SALE_STATUSES)
      .gte("created_at", toArgentinaIso(previousMonthStart))
      .lt("created_at", toArgentinaIso(previousMonthEnd))
      .order("created_at", { ascending: false });

    if (branchId !== "all") {
      currentQuery = currentQuery.eq("branch_id", branchId);
      previousQuery = previousQuery.eq("branch_id", branchId);
    }

    const [{ data: currentRows, error: currentError }, { data: previousRows, error: previousError }] =
      await Promise.all([currentQuery, previousQuery]);

    if (currentError || previousError) {
      setError(currentError?.message || previousError?.message || "No se pudieron cargar las ordenes.");
      setLoading(false);
      return;
    }

    setOrders((currentRows || []) as DashboardOrder[]);
    setPrevMonthOrders((previousRows || []) as DashboardOrder[]);
    setLoading(false);
  };

  const monthSummary = useMemo(() => summarize(orders), [orders]);
  const previousSummary = useMemo(() => summarize(prevMonthOrders), [prevMonthOrders]);
  const todaySummary = useMemo(
    () => summarize(orders.filter((order) => orderLocalDate(order) === today)),
    [orders, today],
  );
  const last7Summary = useMemo(
    () => summarize(orders.filter((order) => orderLocalDate(order) >= addLocalDays(today, -6))),
    [orders, today],
  );

  const dailySales = useMemo(() => {
    const days = Array.from({ length: Math.min(14, elapsedDays) }, (_, index) =>
      addLocalDays(today, index - Math.min(14, elapsedDays) + 1),
    );
    return days.map((date) => {
      const dayOrders = orders.filter((order) => orderLocalDate(order) === date);
      return { date, ...summarize(dayOrders) };
    });
  }, [elapsedDays, orders, today]);

  const maxDailySales = Math.max(...dailySales.map((day) => day.netSales), 1);
  const dailyAverage = monthSummary.netSales / elapsedDays;
  const projectedMonthSales = dailyAverage * totalMonthDays;
  const projectedOrders = (monthSummary.orders / elapsedDays) * totalMonthDays;
  const neededFor100kMore = dailyAverage > 0 ? Math.ceil(100000 / dailyAverage) : 0;
  const previousSameElapsed = summarize(
    prevMonthOrders.filter((order) => Number(orderLocalDate(order).slice(-2)) <= elapsedDays),
  );

  const channelMix = [
    { label: "Delivery", value: monthSummary.delivery, icon: Truck },
    { label: "Takeaway", value: monthSummary.takeaway, icon: ShoppingBag },
    { label: "PedidosYa", value: monthSummary.pedidosya, icon: Package },
  ];

  const paymentMix = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((order) => {
      (order.order_payments || []).forEach((payment) => {
        const name = payment.payment_methods?.name || "Sin metodo";
        map.set(name, (map.get(name) || 0) + Number(payment.amount || 0));
      });
    });
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [orders]);

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; total: number }>();
    orders.forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const name = item.products?.name || item.combos?.name || "Item sin nombre";
        const current = map.get(name) || { name, quantity: 0, total: 0 };
        current.quantity += Number(item.quantity || 0);
        current.total += Number(item.total || 0);
        map.set(name, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 7);
  }, [orders]);

  const insights = [
    `Proyección de cierre: ${formatMoney(projectedMonthSales)} en ventas netas.`,
    `Promedio diario actual: ${formatMoney(dailyAverage)}.`,
    `Faltan ${remainingDays} días del mes; al ritmo actual cerrarías con ${Math.round(projectedOrders)} pedidos.`,
    previousSameElapsed.netSales > 0
      ? `Vas ${formatPct(pctChange(monthSummary.netSales, previousSameElapsed.netSales))} vs el mismo tramo del mes anterior.`
      : "Aún no hay base del mes anterior para comparar este tramo.",
    neededFor100kMore > 0
      ? `Cada ${neededFor100kMore} días al ritmo actual sumás aproximadamente $100.000 netos.`
      : "Todavía no hay ventas suficientes para proyectar bloques de $100.000.",
  ];

  if (loading && !tenant) {
    return <div className="p-6 text-gray-300">Cargando dashboard...</div>;
  }

  if (!tenant) {
    return <div className="p-6 text-gray-300">No tienes restaurante asignado.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-gray-100 md:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-200">
            <BarChart3 size={14} />
            Dashboard ejecutivo
          </div>
          <h1 className="text-2xl font-bold md:text-3xl">{tenant?.name}</h1>
          <p className="mt-2 text-sm text-gray-400">
            Mes actual: {currentMonthStart} a {today} · Rol: {userRole || "sin rol"}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-orange-500"
          >
            <option value="all">Todas las sucursales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <button
            onClick={loadOrders}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-900"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Ventas netas del mes"
          value={formatMoney(monthSummary.netSales)}
          detail={`Sin envíos · ${monthSummary.orders} pedidos`}
          icon={DollarSign}
          change={pctChange(monthSummary.netSales, previousSameElapsed.netSales)}
        />
        <KpiCard
          title="Ticket promedio"
          value={formatMoney(monthSummary.avgTicket)}
          detail={`Hoy ${formatMoney(todaySummary.avgTicket)} · 7d ${formatMoney(last7Summary.avgTicket)}`}
          icon={ShoppingBag}
          change={pctChange(monthSummary.avgTicket, previousSummary.avgTicket)}
        />
        <KpiCard
          title="Proyección mensual"
          value={formatMoney(projectedMonthSales)}
          detail={`${Math.round(projectedOrders)} pedidos proyectados`}
          icon={TrendingUp}
          change={pctChange(projectedMonthSales, previousSummary.netSales)}
        />
        <KpiCard
          title="Cobrado neto"
          value={formatMoney(monthSummary.paid)}
          detail={`${formatMoney(monthSummary.unpaid)} pendiente · envíos ${formatMoney(monthSummary.shipping)}`}
          icon={CreditCard}
          change={monthSummary.netSales ? (monthSummary.paid / monthSummary.netSales) * 100 - 100 : 0}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">Evolución diaria</h2>
              <p className="text-xs text-gray-400">Últimos {dailySales.length} días del mes actual</p>
            </div>
            <Activity className="text-orange-300" size={20} />
          </div>
          <div className="flex h-72 items-end gap-2 overflow-x-auto pb-2">
            {dailySales.map((day) => (
              <div key={day.date} className="flex min-w-16 flex-1 flex-col items-center gap-2">
                <div className="flex h-52 w-full items-end rounded-lg bg-gray-950 p-1">
                  <div
                    className="w-full rounded-md bg-orange-500/80"
                    style={{ height: `${Math.max(4, (day.netSales / maxDailySales) * 100)}%` }}
                    title={`${day.date}: ${formatMoney(day.netSales)}`}
                  />
                </div>
                <div className="text-center">
                  <div className="text-[11px] font-semibold text-gray-300">{day.date.slice(-2)}</div>
                  <div className="text-[10px] text-gray-500">{day.orders} ped.</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Target size={18} className="text-orange-300" />
            <h2 className="font-bold">Proyecciones e insights</h2>
          </div>
          <div className="space-y-3">
            {insights.map((insight) => (
              <div key={insight} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
                {insight}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Mix de canales" icon={Truck}>
          <div className="space-y-3">
            {channelMix.map((channel) => {
              const pct = monthSummary.orders > 0 ? (channel.value / monthSummary.orders) * 100 : 0;
              const Icon = channel.icon;
              return (
                <div key={channel.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-gray-300">
                      <Icon size={15} />
                      {channel.label}
                    </span>
                    <span className="font-semibold">{channel.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-800">
                    <div className="h-2 rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Métodos de pago" icon={CreditCard}>
          <div className="space-y-3">
            {paymentMix.length === 0 ? (
              <EmptyText>No hay pagos cargados en este período.</EmptyText>
            ) : (
              paymentMix.map((payment) => (
                <div key={payment.name} className="flex items-center justify-between rounded-lg bg-gray-950 px-3 py-2 text-sm">
                  <span className="text-gray-300">{payment.name}</span>
                  <span className="font-semibold">{formatMoney(payment.total)}</span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Top productos" icon={Package}>
          <div className="space-y-2">
            {topItems.length === 0 ? (
              <EmptyText>No hay items vendidos este mes.</EmptyText>
            ) : (
              topItems.map((item, index) => (
                <div key={item.name} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-sm">
                  <span className="rounded-md bg-orange-500/10 py-1 text-center text-xs font-bold text-orange-300">#{index + 1}</span>
                  <span className="truncate text-gray-300">{item.name}</span>
                  <span className="font-semibold">{item.quantity}u</span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <SmallStat icon={CalendarDays} label="Días transcurridos" value={`${elapsedDays}/${totalMonthDays}`} />
        <SmallStat icon={Users} label="Clientes únicos" value={monthSummary.customers.toLocaleString("es-AR")} />
        <SmallStat icon={DollarSign} label="Descuentos otorgados" value={formatMoney(monthSummary.discounts)} />
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  change,
}: {
  title: string;
  value: string;
  detail: string;
  icon: any;
  change: number;
}) {
  const positive = change >= 0;
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="rounded-lg bg-orange-500/10 p-2 text-orange-300">
          <Icon size={20} />
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${positive ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
          {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {formatPct(change)}
        </span>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="mt-2 text-xs text-gray-400">{detail}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-orange-300" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SmallStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/70 p-4">
      <div className="rounded-lg bg-gray-950 p-2 text-orange-300">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="font-bold">{value}</p>
      </div>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-gray-700 p-4 text-center text-sm text-gray-400">{children}</div>;
}
