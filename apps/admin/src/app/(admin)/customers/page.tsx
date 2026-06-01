"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  ArrowDownUp,
  CalendarClock,
  DollarSign,
  Eye,
  MapPin,
  Phone,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Trophy,
  Users,
  X,
} from "lucide-react";

type Customer = {
  id: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string | null;
};

type Order = {
  id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  address?: string | null;
  type?: string | null;
  status?: string | null;
  subtotal?: number | null;
  shipping_cost?: number | null;
  discount?: number | null;
  total?: number | null;
  is_paid?: boolean | null;
  created_at: string;
};

type CustomerMetric = {
  key: string;
  customerId?: string | null;
  name: string;
  phone: string;
  address: string;
  orders: number;
  total: number;
  paidTotal: number;
  avgTicket: number;
  deliveryOrders: number;
  takeawayOrders: number;
  pedidosyaOrders: number;
  firstOrderAt: string;
  lastOrderAt: string;
  daysSinceLastOrder: number;
  customer?: Customer;
  orderRows: Order[];
};

const PAGE_SIZE = 1000;
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function dateOnly(date: Date) {
  return date.toISOString().split("T")[0];
}

function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function daysBetweenNow(value?: string | null) {
  if (!value) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
}

export default function CustomersPage() {
  const [tenantId, setTenantId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return dateOnly(date);
  });
  const [dateTo, setDateTo] = useState(() => dateOnly(new Date()));
  const [minOrders, setMinOrders] = useState(1);
  const [minSpent, setMinSpent] = useState(0);
  const [sortBy, setSortBy] = useState<"total" | "orders" | "avgTicket" | "lastOrderAt">("total");
  const [segment, setSegment] = useState<"all" | "vip" | "frequent" | "atRisk" | "new">("all");
  const [limit, setLimit] = useState(100);
  const [selected, setSelected] = useState<CustomerMetric | null>(null);

  const loadTenant = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (userRecord?.tenant_id) setTenantId(userRecord.tenant_id);
  };

  const fetchPaged = async (table: string, select: string, apply: (query: any) => any) => {
    const rows: any[] = [];
    let from = 0;

    while (true) {
      const query = apply(supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1));
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return rows;
  };

  const loadData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [customerRows, orderRows] = await Promise.all([
        fetchPaged("customers", "id, name, phone, address, created_at", (query) =>
          query.eq("tenant_id", tenantId).order("created_at", { ascending: false }),
        ),
        fetchPaged(
          "orders",
          "id, customer_id, customer_name, customer_phone, address, type, status, subtotal, shipping_cost, discount, total, is_paid, created_at",
          (query) => {
            const next = query
              .eq("tenant_id", tenantId)
              .neq("status", "cancelled")
              .gte("created_at", `${dateFrom}T00:00:00`)
              .lte("created_at", `${dateTo}T23:59:59`)
              .order("created_at", { ascending: false });
            return next;
          },
        ),
      ]);

      setCustomers(customerRows);
      setOrders(orderRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTenant(); }, []);
  useEffect(() => { loadData(); }, [tenantId, dateFrom, dateTo]);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const metrics = useMemo(() => {
    const map = new Map<string, CustomerMetric>();

    orders.forEach((order) => {
      const customer = order.customer_id ? customerById.get(order.customer_id) : undefined;
      const phone = normalizePhone(customer?.phone || order.customer_phone);
      const key = order.customer_id || (phone ? `phone:${phone}` : `order:${order.id}`);
      const total = Number(order.total || 0);
      const current = map.get(key) || {
        key,
        customerId: order.customer_id,
        name: customer?.name || order.customer_name || "Sin nombre",
        phone: phone || normalizePhone(order.customer_phone),
        address: customer?.address || order.address || "",
        orders: 0,
        total: 0,
        paidTotal: 0,
        avgTicket: 0,
        deliveryOrders: 0,
        takeawayOrders: 0,
        pedidosyaOrders: 0,
        firstOrderAt: order.created_at,
        lastOrderAt: order.created_at,
        daysSinceLastOrder: daysBetweenNow(order.created_at),
        customer,
        orderRows: [],
      };

      current.orders += 1;
      current.total += total;
      if (order.is_paid) current.paidTotal += total;
      if (order.type === "delivery") current.deliveryOrders += 1;
      if (order.type === "takeaway") current.takeawayOrders += 1;
      if (order.type === "pedidosya") current.pedidosyaOrders += 1;
      if (new Date(order.created_at) < new Date(current.firstOrderAt)) current.firstOrderAt = order.created_at;
      if (new Date(order.created_at) > new Date(current.lastOrderAt)) current.lastOrderAt = order.created_at;
      current.daysSinceLastOrder = daysBetweenNow(current.lastOrderAt);
      current.avgTicket = current.orders > 0 ? current.total / current.orders : 0;
      current.orderRows.push(order);
      map.set(key, current);
    });

    return Array.from(map.values());
  }, [customerById, orders]);

  const filteredMetrics = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = metrics
      .filter((customer) => {
        if (customer.orders < minOrders) return false;
        if (customer.total < minSpent) return false;
        if (segment === "vip" && customer.total < 100000) return false;
        if (segment === "frequent" && customer.orders < 5) return false;
        if (segment === "atRisk" && customer.daysSinceLastOrder < 30) return false;
        if (segment === "new" && customer.orders !== 1) return false;
        if (!term) return true;
        return [customer.name, customer.phone, customer.address].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => {
        if (sortBy === "orders") return b.orders - a.orders;
        if (sortBy === "avgTicket") return b.avgTicket - a.avgTicket;
        if (sortBy === "lastOrderAt") return new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime();
        return b.total - a.total;
      });

    return sorted.slice(0, limit);
  }, [limit, metrics, minOrders, minSpent, search, segment, sortBy]);

  const totals = useMemo(() => {
    const totalRevenue = metrics.reduce((sum, customer) => sum + customer.total, 0);
    const totalOrders = metrics.reduce((sum, customer) => sum + customer.orders, 0);
    const repeatCustomers = metrics.filter((customer) => customer.orders >= 2).length;
    const atRisk = metrics.filter((customer) => customer.daysSinceLastOrder >= 30).length;
    const topCustomer = [...metrics].sort((a, b) => b.total - a.total)[0];

    return {
      customers: metrics.length,
      totalRevenue,
      totalOrders,
      avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      repeatCustomers,
      atRisk,
      topCustomer,
    };
  }, [metrics]);

  const selectedOrders = selected?.orderRows || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-gray-500">Clientes y comportamiento de compra</p>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard de Clientes</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { label: "Clientes con compra", value: totals.customers.toLocaleString("es-AR"), icon: Users, color: "text-blue-400" },
          { label: "Pedidos", value: totals.totalOrders.toLocaleString("es-AR"), icon: ShoppingBag, color: "text-purple-400" },
          { label: "Facturacion", value: currency.format(totals.totalRevenue), icon: DollarSign, color: "text-emerald-400" },
          { label: "Ticket promedio", value: currency.format(totals.avgTicket), icon: Trophy, color: "text-amber-400" },
          { label: "Recurrentes", value: totals.repeatCustomers.toLocaleString("es-AR"), icon: Star, color: "text-green-400" },
          { label: "Sin comprar 30d", value: totals.atRisk.toLocaleString("es-AR"), icon: CalendarClock, color: "text-red-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="mb-2 flex items-center gap-2">
              <stat.icon size={16} className={stat.color} />
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
            <p className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-100">Filtros</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="relative md:col-span-2">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar nombre, telefono o direccion"
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-gray-100 outline-none"
                />
              </label>

              <input
                type="number"
                min={1}
                value={minOrders}
                onChange={(event) => setMinOrders(Number(event.target.value || 1))}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                title="Pedidos minimos"
              />
              <input
                type="number"
                min={0}
                value={minSpent}
                onChange={(event) => setMinSpent(Number(event.target.value || 0))}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                title="Monto minimo"
              />
              <select
                value={segment}
                onChange={(event) => setSegment(event.target.value as any)}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              >
                <option value="all">Todos</option>
                <option value="vip">VIP +$100k</option>
                <option value="frequent">Frecuentes 5+</option>
                <option value="atRisk">Riesgo 30d</option>
                <option value="new">Una compra</option>
              </select>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as any)}
                className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              >
                <option value="total">Ranking por monto</option>
                <option value="orders">Ranking por pedidos</option>
                <option value="avgTicket">Ticket promedio</option>
                <option value="lastOrderAt">Ultima compra</option>
              </select>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[25, 50, 100, 250].map((value) => (
                <button
                  key={value}
                  onClick={() => setLimit(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    limit === value ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Top {value}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
            <div className="grid min-w-[980px] grid-cols-12 gap-2 border-b border-gray-800 px-4 py-3 text-xs font-semibold uppercase text-gray-500">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Cliente</div>
              <div className="col-span-1 text-right">Pedidos</div>
              <div className="col-span-2 text-right">Monto</div>
              <div className="col-span-2 text-right">Ticket</div>
              <div className="col-span-2">Ultima compra</div>
              <div className="col-span-1 text-right">Ver</div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-gray-500">Cargando clientes...</div>
            ) : filteredMetrics.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500">Sin clientes para estos filtros</div>
            ) : (
              <div className="max-h-[680px] overflow-auto">
                {filteredMetrics.map((customer, index) => {
                  const maxTotal = filteredMetrics[0]?.total || 1;
                  const width = Math.max(4, Math.round((customer.total / maxTotal) * 100));

                  return (
                    <button
                      key={customer.key}
                      onClick={() => setSelected(customer)}
                      className={`grid min-w-[980px] grid-cols-12 gap-2 border-b border-gray-800 px-4 py-3 text-left transition hover:bg-gray-800/60 ${
                        selected?.key === customer.key ? "bg-gray-800" : ""
                      }`}
                    >
                      <div className="col-span-1 text-sm font-semibold text-gray-500">{index + 1}</div>
                      <div className="col-span-3 min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-100">{customer.name}</p>
                        <p className="truncate text-xs text-gray-500">{customer.phone || "Sin telefono"}</p>
                        <div className="mt-2 h-1.5 rounded-full bg-gray-800">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                      <div className="col-span-1 text-right text-sm font-semibold text-blue-300">{customer.orders}</div>
                      <div className="col-span-2 text-right text-sm font-semibold text-emerald-300">{currency.format(customer.total)}</div>
                      <div className="col-span-2 text-right text-sm text-gray-300">{currency.format(customer.avgTicket)}</div>
                      <div className="col-span-2 text-sm text-gray-400">
                        <p>{formatDate(customer.lastOrderAt)}</p>
                        <p className="text-xs text-gray-600">{customer.daysSinceLastOrder} dias</p>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Eye size={16} className="text-gray-500" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-gray-800 bg-gray-900">
          {!selected ? (
            <div className="flex min-h-[520px] items-center justify-center p-8 text-center text-gray-500">
              <div>
                <Users size={36} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">Selecciona un cliente para ver su historial</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="border-b border-gray-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-gray-100">{selected.name}</p>
                    <div className="mt-2 space-y-1 text-sm text-gray-500">
                      {selected.phone && <p className="flex items-center gap-2"><Phone size={14} /> {selected.phone}</p>}
                      {selected.address && <p className="flex items-center gap-2"><MapPin size={14} /> {selected.address}</p>}
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-800 hover:text-gray-200">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-4">
                <MiniStat label="Pedidos" value={selected.orders.toString()} />
                <MiniStat label="Monto" value={currency.format(selected.total)} />
                <MiniStat label="Ticket" value={currency.format(selected.avgTicket)} />
                <MiniStat label="Recencia" value={`${selected.daysSinceLastOrder} dias`} />
              </div>

              <div className="border-t border-gray-800 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ArrowDownUp size={15} className="text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-100">Ultimos pedidos</h3>
                </div>
                <div className="space-y-2">
                  {selectedOrders.slice(0, 12).map((order) => (
                    <div key={order.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-200">#{order.id.slice(-8).toUpperCase()}</p>
                        <p className="text-sm font-semibold text-emerald-300">{currency.format(Number(order.total || 0))}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <span>{order.type || "pedido"} · {order.status || "-"}</span>
                        <span>{formatDate(order.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-100">{value}</p>
    </div>
  );
}
