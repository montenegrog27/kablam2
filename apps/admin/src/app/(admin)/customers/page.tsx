"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  Search, Phone, ShoppingBag, DollarSign, Star, Users, Trophy, CalendarClock,
  Eye, X, MapPin, Clock, AlertTriangle, MessageCircle, TrendingUp, TrendingDown,
  Download, FileText, Target, BarChart3, Heart, Zap,
} from "lucide-react";

type Order = { id: string; customer_id?: string | null; customer_name?: string | null; customer_phone?: string | null; total?: number | null; status?: string | null; type?: string | null; created_at: string; };
type Customer = { id: string; name?: string | null; phone?: string | null; address?: string | null; created_at?: string | null; };

type CustomerCRM = {
  id: string; name: string; phone: string; address: string;
  totalOrders: number; totalSpent: number; avgTicket: number;
  firstOrderAt: string; lastOrderAt: string; createdAt: string;
  daysSinceLastOrder: number; daysSinceFirstOrder: number; frequencyDays: number;
  ltv: number; last3Avg: number; ticketTrend: number;
  segment: "active" | "at_risk" | "dormant" | "lost" | "new" | "recovered";
  isNew: boolean; isRecovered: boolean; isVip: boolean; orders: Order[];
};

const PAGE_SIZE = 3000;
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fmt = (n: number) => n.toLocaleString("es-AR");
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

function daysAgo(dateStr: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function getSegment(days: number, totalOrders: number, isNew: boolean, isRecovered: boolean): CustomerCRM["segment"] {
  if (isNew) return "new";
  if (isRecovered) return "recovered";
  if (days <= 15) return "active";
  if (days <= 30) return "at_risk";
  if (days <= 60) return "dormant";
  return "lost";
}

const SEGMENT_LABELS: Record<string, string> = {
  new: "Nuevos", active: "Activos", at_risk: "En riesgo", dormant: "Dormidos", lost: "Perdidos", recovered: "Recuperados",
};
const SEGMENT_COLORS: Record<string, string> = {
  new: "bg-blue-500", active: "bg-emerald-500", at_risk: "bg-amber-500", dormant: "bg-orange-500", lost: "bg-red-500", recovered: "bg-purple-500",
};
const SEGMENT_TEXT_COLORS: Record<string, string> = {
  new: "text-blue-300", active: "text-emerald-300", at_risk: "text-amber-300", dormant: "text-orange-300", lost: "text-red-300", recovered: "text-purple-300",
};

export default function CustomersPage() {
  const [tenantId, setTenantId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerCRM | null>(null);
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"health" | "retention" | "value" | "opportunities" | "cohorts">("health");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);

    const [{ data: custs }, { data: ords }] = await Promise.all([
      supabase.from("customers").select("id, name, phone, address, created_at").eq("tenant_id", r.tenant_id).order("name"),
      supabase.from("orders").select("id, customer_id, customer_name, total, status, type, created_at").eq("tenant_id", r.tenant_id).in("status", ["delivered", "sent", "ready"]).order("created_at", { ascending: false }),
    ]);
    setCustomers(custs || []);
    setOrders(ords || []);
    setLoading(false);
  };

  const crmData = useMemo(() => {
    const customerOrders: Record<string, Order[]> = {};
    orders.forEach((o) => {
      const cid = o.customer_id || `phone:${o.customer_phone}`;
      if (!customerOrders[cid]) customerOrders[cid] = [];
      customerOrders[cid].push(o);
    });

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
    const result: CustomerCRM[] = [];

    Object.entries(customerOrders).forEach(([cid, ords]) => {
      const customer = customerMap.get(cid);
      const name = customer?.name || ords[0]?.customer_name || "Anónimo";
      const phone = customer?.phone || ords[0]?.customer_phone || "";
      const address = customer?.address || "";
      const createdAt = customer?.created_at || ords[ords.length - 1]?.created_at || "";
      const totalOrders = ords.length;
      const totalSpent = ords.reduce((s, o) => s + Number(o.total || 0), 0);
      const avgTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;
      const firstOrderAt = ords[ords.length - 1]?.created_at || "";
      const lastOrderAt = ords[0]?.created_at || "";
      const daysSinceLastOrder = daysAgo(lastOrderAt);
      const daysSinceFirstOrder = daysAgo(firstOrderAt);
      const frequencyDays = totalOrders > 1 ? daysSinceFirstOrder / (totalOrders - 1) : 999;

      const last3 = ords.slice(0, 3);
      const last3Avg = last3.length > 0 ? last3.reduce((s, o) => s + Number(o.total || 0), 0) / last3.length : 0;
      const ticketTrend = avgTicket > 0 ? (last3Avg - avgTicket) / avgTicket : 0;
      const ltv = totalSpent;

      const isNew = totalOrders === 1 && daysSinceLastOrder <= 7;
      const isRecovered = totalOrders >= 2 && daysSinceFirstOrder > 60 && daysSinceLastOrder <= 15;
      const isVip = totalOrders >= 5 || ltv > 100000;

      result.push({
        id: cid, name, phone, address, totalOrders, totalSpent, avgTicket,
        firstOrderAt, lastOrderAt, createdAt, daysSinceLastOrder, daysSinceFirstOrder,
        frequencyDays, ltv, last3Avg, ticketTrend,
        segment: getSegment(daysSinceLastOrder, totalOrders, isNew, isRecovered),
        isNew, isRecovered, isVip, orders: ords,
      });
    });

    return result.sort((a, b) => b.ltv - a.ltv);
  }, [customers, orders]);

  // === METRICS ===
  const uniqueCustomers = crmData.length;
  const c1 = crmData.filter((c) => c.totalOrders === 1).length;
  const c2 = crmData.filter((c) => c.totalOrders === 2).length;
  const c3 = crmData.filter((c) => c.totalOrders === 3).length;
  const c4 = crmData.filter((c) => c.totalOrders >= 4).length;
  const repeatCount = crmData.filter((c) => c.totalOrders >= 2).length;
  const repeatRate = uniqueCustomers > 0 ? repeatCount / uniqueCustomers : 0;
  const avgLtv = uniqueCustomers > 0 ? crmData.reduce((s, c) => s + c.ltv, 0) / uniqueCustomers : 0;
  const avgFreq = repeatCount > 0 ? crmData.filter((c) => c.totalOrders >= 2).reduce((s, c) => s + c.frequencyDays, 0) / repeatCount : 0;
  const vipCount = crmData.filter((c) => c.isVip).length;
  const recurringRevenue = crmData.filter((c) => c.totalOrders >= 2).reduce((s, c) => s + c.ltv, 0);
  const totalRevenue = crmData.reduce((s, c) => s + c.ltv, 0);
  const recurringShare = totalRevenue > 0 ? recurringRevenue / totalRevenue : 0;
  const top20 = crmData.slice(0, 20);
  const top20Ltv = top20.reduce((s, c) => s + c.ltv, 0);

  const segments = ["new", "active", "at_risk", "dormant", "lost", "recovered"];
  const segmentCounts: Record<string, number> = {};
  segments.forEach((seg) => { segmentCounts[seg] = crmData.filter((c) => c.segment === seg).length; });

  // Opportunities
  const opp15 = crmData.filter((c) => c.daysSinceLastOrder >= 13 && c.daysSinceLastOrder <= 17 && c.segment !== "lost");
  const opp30 = crmData.filter((c) => c.daysSinceLastOrder >= 28 && c.daysSinceLastOrder <= 32 && c.segment !== "lost");
  const opp60 = crmData.filter((c) => c.daysSinceLastOrder >= 58 && c.daysSinceLastOrder <= 62);
  const recoverableValue = opp30.reduce((s, c) => s + c.ltv, 0) + opp60.reduce((s, c) => s + c.ltv, 0);

  // Cohorts
  const cohorts = useMemo(() => {
    const byMonth: Record<string, { total: number; returning: number }> = {};
    crmData.forEach((c) => {
      if (!c.firstOrderAt) return;
      const month = c.firstOrderAt.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { total: 0, returning: 0 };
      byMonth[month].total++;
      if (c.totalOrders >= 2) byMonth[month].returning++;
    });
    return Object.entries(byMonth).sort().slice(-12).map(([month, data]) => ({
      month,
      label: new Date(month + "-01").toLocaleDateString("es-AR", { month: "short", year: "2-digit" }),
      total: data.total,
      returning: data.returning,
      retention: data.total > 0 ? data.returning / data.total : 0,
    }));
  }, [crmData]);

  // Insights
  const insights = useMemo(() => {
    const msgs: string[] = [];
    const oneTimerPct = uniqueCustomers > 0 ? c1 / uniqueCustomers : 0;
    msgs.push(`El ${fmtPct(oneTimerPct)} de los clientes solo compro una vez.`);
    if (segmentCounts["dormant"] > 0) {
      const dormantValue = crmData.filter((c) => c.segment === "dormant").reduce((s, c) => s + c.ltv, 0);
      msgs.push(`Existen ${segmentCounts["dormant"]} clientes dormidos con potencial de recuperacion de ${currency.format(dormantValue)}.`);
    }
    msgs.push(`Los clientes recurrentes generan el ${fmtPct(recurringShare)} de la facturacion.`);
    if (avgFreq > 0) msgs.push(`La frecuencia promedio de recompra es de ${Math.round(avgFreq)} dias.`);
    if (vipCount > 0) msgs.push(`${vipCount} clientes VIP generan ${currency.format(top20Ltv)} en LTV combinado.`);
    if (opp30.length > 0) msgs.push(`${opp30.length} clientes estan cumpliendo 30 dias sin comprar — momento ideal para reactivarlos.`);
    msgs.push(`El ticket promedio de clientes recurrentes es ${currency.format(
      crmData.filter((c) => c.totalOrders >= 2).reduce((s, c) => s + c.avgTicket, 0) / Math.max(1, repeatCount)
    )} vs ${currency.format(
      crmData.filter((c) => c.totalOrders === 1).reduce((s, c) => s + c.avgTicket, 0) / Math.max(1, c1)
    )} de compra unica.`);
    return msgs;
  }, [crmData]);

  const filtered = useMemo(() => {
    let list = crmData;
    if (segmentFilter !== "all") list = list.filter((c) => c.segment === segmentFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [crmData, segmentFilter, search]);

  const SegBadge = ({ seg }: { seg: string }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${SEGMENT_COLORS[seg]}/20 ${SEGMENT_TEXT_COLORS[seg]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEGMENT_COLORS[seg]}`} />
      {SEGMENT_LABELS[seg]}
    </span>
  );

  const exportJSON = () => {
    // Full CRM data: all customers with metrics
    const allData = crmData.slice(0, 2000).map((c) => ({
      nombre: c.name, telefono: c.phone, direccion: c.address,
      segmento: c.segment, es_vip: c.isVip, es_nuevo: c.isNew, es_recuperado: c.isRecovered,
      pedidos_totales: c.totalOrders, gasto_total: Math.round(c.ltv),
      ticket_promedio: Math.round(c.avgTicket),
      ticket_promedio_ultimos_3: Math.round(c.last3Avg),
      tendencia_ticket_pct: Math.round(c.ticketTrend * 100),
      primer_pedido: c.firstOrderAt, ultimo_pedido: c.lastOrderAt,
      dias_ultimo_pedido: c.daysSinceLastOrder, dias_desde_primera_compra: c.daysSinceFirstOrder,
      frecuencia_dias: c.frequencyDays < 999 ? Math.round(c.frequencyDays) : null,
    }));
    const report = {
      generado: new Date().toISOString(),
      resumen: {
        clientes_unicos: uniqueCustomers,
        clientes_con_1_compra: c1, clientes_con_2_compras: c2, clientes_con_3_compras: c3, clientes_con_4_mas_compras: c4,
        repeat_rate_pct: Math.round(repeatRate * 10000) / 100,
        frecuencia_promedio_dias: Math.round(avgFreq),
        ltv_promedio: Math.round(avgLtv),
        clientes_vip: vipCount,
        facturacion_recurrente_pct: Math.round(recurringShare * 10000) / 100,
      },
      segmentos: Object.fromEntries(segments.map((seg) => [seg, { cantidad: segmentCounts[seg], label: SEGMENT_LABELS[seg] }])),
      oportunidades: {
        proximos_15_dias: opp15.length,
        proximos_30_dias: opp30.length,
        proximos_60_dias: opp60.length,
        valor_recuperable_estimado: Math.round(recoverableValue),
      },
      top_20_ltv: crmData.slice(0, 20).map((c, i) => ({
        rank: i + 1, nombre: c.name, telefono: c.phone, ltv: Math.round(c.ltv), pedidos: c.totalOrders, segmento: c.segment,
      })),
      cohortes: cohorts.map((c) => ({ mes: c.month, nuevos: c.total, recurrentes: c.returning, retencion_pct: Math.round(c.retention * 10000) / 100 })),
      clientes: allData,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `crm_clientes_${new Date().toISOString().split("T")[0]}.json`; a.click();
  };

  const exportCSV = () => {
    const headers = ["Nombre", "Teléfono", "Dirección", "Segmento", "VIP", "Pedidos", "Gasto Total", "Ticket Prom.", "Ticket Últimos 3", "Tendencia (%)", "Primer Pedido", "Último Pedido", "Días sin comprar", "Días desde 1ra compra", "Frecuencia (días)"];
    const rows = crmData.slice(0, 2000).map((c) => [
      c.name, c.phone, c.address, c.segment, c.isVip ? "Sí" : "No", c.totalOrders.toString(),
      Math.round(c.ltv).toString(), Math.round(c.avgTicket).toString(), Math.round(c.last3Avg).toString(),
      Math.round(c.ticketTrend * 100).toString(), c.firstOrderAt, c.lastOrderAt,
      c.daysSinceLastOrder.toString(), c.daysSinceFirstOrder.toString(),
      c.frequencyDays < 999 ? Math.round(c.frequencyDays).toString() : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `clientes_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  if (loading) return <div className="p-12 text-center text-gray-500">Cargando datos de clientes...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2"><Users size={22} /> Customer Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">{uniqueCustomers} clientes · {orders.length} pedidos</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportJSON} className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-gray-300 border border-gray-700 rounded-lg text-xs font-medium hover:bg-gray-800 transition"><FileText size={14} /> JSON</button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-emerald-700 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition"><Download size={14} /> Excel</button>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-xl p-4 space-y-1">
        {insights.map((msg, i) => (
          <p key={i} className="text-sm text-gray-300 flex items-start gap-2"><BarChart3 size={14} className="text-blue-400 mt-0.5 flex-shrink-0" /> {msg}</p>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-xl p-1 overflow-x-auto">
        {([{ id: "health", label: "Customer Health", icon: Heart }, { id: "retention", label: "Retención", icon: Target }, { id: "value", label: "Valor", icon: Trophy }, { id: "opportunities", label: "Oportunidades", icon: Zap }, { id: "cohorts", label: "Cohortes", icon: CalendarClock }] as const).map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition ${activeTab === tab.id ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Customer Health */}
      {activeTab === "health" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {segments.map((seg) => (
              <button key={seg} onClick={() => setSegmentFilter(segmentFilter === seg ? "all" : seg)}
                className={`bg-gray-900 border rounded-xl p-4 text-center transition cursor-pointer hover:border-gray-600 ${segmentFilter === seg ? "border-gray-500 ring-1 ring-gray-500" : "border-gray-700"}`}>
                <div className={`w-2 h-2 rounded-full mx-auto mb-2 ${SEGMENT_COLORS[seg]}`} />
                <p className={`text-lg font-bold ${SEGMENT_TEXT_COLORS[seg]}`}>{segmentCounts[seg]}</p>
                <p className="text-[10px] text-gray-500 uppercase mt-0.5">{SEGMENT_LABELS[seg]}</p>
              </button>
            ))}
          </div>
          {/* Customer list by segment */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Segmento</th>
                    <th className="px-4 py-3 text-right">Pedidos</th>
                    <th className="px-4 py-3 text-right">Ticket</th>
                    <th className="px-4 py-3 text-right">LTV</th>
                    <th className="px-4 py-3 text-right">Días</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.slice(0, 100).map((c) => (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3"><p className="font-medium text-gray-100">{c.name}</p><p className="text-[10px] text-gray-500">{c.phone}</p></td>
                      <td className="px-4 py-3"><SegBadge seg={c.segment} /></td>
                      <td className="px-4 py-3 text-right text-gray-100">{c.totalOrders}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{currency.format(c.avgTicket)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">{currency.format(c.ltv)}</td>
                      <td className={`px-4 py-3 text-right ${c.daysSinceLastOrder <= 15 ? "text-emerald-400" : c.daysSinceLastOrder <= 30 ? "text-amber-400" : c.daysSinceLastOrder <= 60 ? "text-orange-400" : "text-red-400"}`}>{c.daysSinceLastOrder}d</td>
                      <td className="px-4 py-3"><button onClick={() => setSelectedCustomer(c)} className="p-1 rounded hover:bg-gray-800 text-gray-500"><Eye size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Retención */}
      {activeTab === "retention" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-100 mb-4">Distribución por compras</h3>
            <div className="space-y-3">
              {[
                { label: "1 compra", value: c1, pct: uniqueCustomers > 0 ? c1 / uniqueCustomers : 0 },
                { label: "2 compras", value: c2, pct: uniqueCustomers > 0 ? c2 / uniqueCustomers : 0 },
                { label: "3 compras", value: c3, pct: uniqueCustomers > 0 ? c3 / uniqueCustomers : 0 },
                { label: "4+ compras", value: c4, pct: uniqueCustomers > 0 ? c4 / uniqueCustomers : 0 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">{item.label}</span>
                    <span className="text-gray-200 font-semibold">{fmt(item.value)} · {fmtPct(item.pct)}</span>
                  </div>
                  <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full transition-all" style={{ width: `${Math.max(2, item.pct * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-100 mb-4">Métricas de retención</h3>
            <div className="grid grid-cols-2 gap-4">
              <MetricBox label="Clientes únicos" value={fmt(uniqueCustomers)} />
              <MetricBox label="Repeat Rate" value={fmtPct(repeatRate)} />
              <MetricBox label="Frecuencia prom." value={avgFreq > 0 ? `${Math.round(avgFreq)} días` : "-"} />
              <MetricBox label="Clientes recurrentes" value={fmt(repeatCount)} />
              <MetricBox label="Fact. recurrente" value={currency.format(recurringRevenue)} />
              <MetricBox label="Share recurrente" value={fmtPct(recurringShare)} />
            </div>
            {/* WhatsApp campaign buttons */}
            <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Campañas WhatsApp por segmento</p>
              <div className="flex flex-wrap gap-2">
                {segments.map((seg) => (
                  <button key={seg}
                    onClick={() => {
                      const phones = crmData.filter((c) => c.segment === seg).map((c) => c.phone.replace(/\D/g, "")).filter(Boolean);
                      const csv = phones.join(",");
                      navigator.clipboard.writeText(csv);
                      alert(`${phones.length} teléfonos copiados al portapapeles`);
                    }}
                    className={`text-[10px] px-3 py-1.5 rounded-full font-bold border ${SEGMENT_COLORS[seg]}/20 border-gray-700 text-gray-300 hover:bg-gray-800 transition flex items-center gap-1.5`}>
                    <MessageCircle size={11} /> {SEGMENT_LABELS[seg]} ({segmentCounts[seg]})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Valor */}
      {activeTab === "value" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="LTV Promedio" value={currency.format(avgLtv)} icon={DollarSign} color="text-emerald-400" />
            <MetricCard label="Clientes VIP" value={fmt(vipCount)} icon={Trophy} color="text-purple-400" />
            <MetricCard label="Top 20 LTV" value={currency.format(top20Ltv)} icon={Star} color="text-amber-400" />
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 text-xs font-semibold text-gray-500 uppercase tracking-wider">Top 20 clientes por LTV</div>
            <div className="divide-y divide-gray-800">
              {top20.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-5 text-right">{i + 1}</span>
                    <div>
                      <p className="text-gray-100 font-medium">{c.name}</p>
                      <p className="text-[10px] text-gray-500">{c.totalOrders} pedidos · {Math.round(c.avgTicket).toLocaleString("es-AR")} ticket prom.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-400">{currency.format(c.ltv)}</p>
                    <SegBadge seg={c.segment} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Oportunidades */}
      {activeTab === "opportunities" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <OpportunityCard title="Próximos a los 15 días" count={opp15.length}
            description="Clientes activos que están por entrar en riesgo. Momento ideal para mandar una oferta."
            actions={<ActionBtn seg="active" label="Enviar oferta" crmData={crmData} filter={(c) => c.daysSinceLastOrder >= 13 && c.daysSinceLastOrder <= 17 && c.segment !== "lost"} />}
          />
          <OpportunityCard title="Próximos a los 30 días" count={opp30.length}
            description="Clientes en riesgo que están por dormirse. Campaña de reactivación urgente."
            value={currency.format(opp30.reduce((s, c) => s + c.ltv, 0))}
            actions={<ActionBtn seg="at_risk" label="Reactivar" crmData={crmData} filter={(c) => c.daysSinceLastOrder >= 28 && c.daysSinceLastOrder <= 32 && c.segment !== "lost"} />}
          />
          <OpportunityCard title="Próximos a los 60 días" count={opp60.length}
            description="Clientes dormidos a punto de perderse. Descuento fuerte para recuperarlos."
            value={currency.format(opp60.reduce((s, c) => s + c.ltv, 0))}
            actions={<ActionBtn seg="dormant" label="Recuperar" crmData={crmData} filter={(c) => c.daysSinceLastOrder >= 58 && c.daysSinceLastOrder <= 62} />}
          />
        </div>
      )}

      {/* TAB: Cohortes */}
      {activeTab === "cohorts" && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-100 mb-4">Retención por mes de adquisición</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                <tr>
                  <th className="px-3 py-2">Mes</th>
                  <th className="px-3 py-2 text-right">Nuevos</th>
                  <th className="px-3 py-2 text-right">Recurrentes</th>
                  <th className="px-3 py-2 text-right">Retención</th>
                  <th className="px-3 py-2">
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {cohorts.map((cohort) => (
                  <tr key={cohort.month} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 font-medium text-gray-100">{cohort.label}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300">{cohort.total}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300">{cohort.returning}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-400">{fmtPct(cohort.retention)}</td>
                    <td className="px-3 py-2.5">
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${Math.max(2, cohort.retention * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {cohorts.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500 text-sm">Sin datos suficientes</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer detail modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-gray-700">
            <div className="flex items-center justify-between p-5 border-b border-gray-700 sticky top-0 bg-gray-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-300">{selectedCustomer.name.charAt(0).toUpperCase()}</div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedCustomer.name}</h3>
                  <p className="text-xs text-gray-500">{selectedCustomer.phone}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBox label="Pedidos" value={selectedCustomer.totalOrders.toString()} />
                <StatBox label="Ticket prom." value={currency.format(selectedCustomer.avgTicket)} color="text-emerald-400" />
                <StatBox label="LTV" value={currency.format(selectedCustomer.ltv)} color="text-purple-400" />
                <StatBox label={SEGMENT_LABELS[selectedCustomer.segment] || selectedCustomer.segment} value="" color={SEGMENT_TEXT_COLORS[selectedCustomer.segment]}>
                  <SegBadge seg={selectedCustomer.segment} />
                </StatBox>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2 bg-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Info</p>
                  <Row label="Teléfono" value={selectedCustomer.phone} />
                  <Row label="Dirección" value={selectedCustomer.address || "-"} />
                  <Row label="Primer pedido" value={selectedCustomer.firstOrderAt ? new Date(selectedCustomer.firstOrderAt).toLocaleDateString() : "-"} />
                  <Row label="Último pedido" value={selectedCustomer.lastOrderAt ? new Date(selectedCustomer.lastOrderAt).toLocaleDateString() : "-"} />
                </div>
                <div className="space-y-2 bg-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Métricas</p>
                  <Row label="Días desde último" value={`${selectedCustomer.daysSinceLastOrder}d`} />
                  <Row label="Frecuencia" value={selectedCustomer.frequencyDays < 999 ? `${Math.round(selectedCustomer.frequencyDays)}d` : "1 sola vez"} />
                  <Row label="Últimos 3 tickets" value={currency.format(selectedCustomer.last3Avg)} />
                  <Row label="Tendencia" value={selectedCustomer.ticketTrend !== 0 ? `${selectedCustomer.ticketTrend > 0 ? "↑" : "↓"} ${Math.abs(Math.round(selectedCustomer.ticketTrend * 100))}%` : "-"}
                    color={selectedCustomer.ticketTrend > 0 ? "text-emerald-400" : "text-red-400"} />
                </div>
              </div>
              <div className="border-t border-gray-700 pt-4 flex gap-2">
                <a href={`https://wa.me/${selectedCustomer.phone.replace(/\D/g, "")}`} target="_blank"
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition">
                  <MessageCircle size={16} /> Enviar WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1"><Icon size={14} className={color} /><span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span></div>
      <p className={`text-lg font-bold ${color} tabular-nums`}>{value}</p>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return <div className="bg-gray-800 rounded-xl p-3"><p className="text-[10px] text-gray-500 uppercase">{label}</p><p className="text-lg font-bold text-white">{value}</p></div>;
}

function StatBox({ label, value, color, children }: { label: string; value: string; color?: string; children?: React.ReactNode }) {
  return <div className="bg-gray-800 rounded-xl p-3 text-center">
    <p className="text-[10px] text-gray-500 uppercase">{label}</p>
    {children || <p className={`text-xl font-bold ${color || "text-white"}`}>{value}</p>}
  </div>;
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="flex justify-between"><span className="text-gray-400">{label}</span><span className={color || "text-gray-100"}>{value}</span></div>;
}

function OpportunityCard({ title, count, description, value, actions }: { title: string; count: number; description: string; value?: string; actions?: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        <span className="text-lg font-bold text-amber-400">{count}</span>
      </div>
      <p className="text-xs text-gray-500">{description}</p>
      {value && <p className="text-sm font-semibold text-gray-300">Valor potencial: <span className="text-emerald-400">{value}</span></p>}
      {actions}
    </div>
  );
}

function ActionBtn({ seg, label, crmData, filter: filterFn }: { seg: string; label: string; crmData: CustomerCRM[]; filter: (c: CustomerCRM) => boolean }) {
  const filtered = crmData.filter(filterFn);
  return (
    <button onClick={() => {
      const phones = filtered.map((c) => c.phone.replace(/\D/g, "")).filter(Boolean);
      navigator.clipboard.writeText(phones.join(","));
      alert(`${phones.length} teléfonos copiados al portapapeles`);
    }} disabled={filtered.length === 0}
      className="w-full py-2 bg-gray-800 text-gray-300 rounded-lg text-xs font-bold hover:bg-gray-700 transition disabled:opacity-30 border border-gray-700 flex items-center justify-center gap-1.5">
      <MessageCircle size={12} /> {label} ({filtered.length})
    </button>
  );
}
