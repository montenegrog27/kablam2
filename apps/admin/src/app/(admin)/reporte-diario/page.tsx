"use client";
import { useEffect, useState, useCallback } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  Download, Calendar, FileText, TrendingUp, TrendingDown,
  DollarSign, ShoppingCart, Truck, Percent, Clock, Award,
  PieChart, BarChart3, ChevronDown, ChevronUp, Printer,
  Users, Package, Receipt, Calculator,
} from "lucide-react";

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

export default function ReporteDiarioPage() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => {
    return addLocalDays(argentinaDateString(), -1);
  });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);
  };

  const loadReport = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/daily?date=${date}&tenantId=${tenantId}`);
      const data = await res.json();
      setReport(data);
    } catch (e) {
      console.error("Report error:", e);
    }
    setLoading(false);
  }, [date, tenantId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Navigation helpers
  const prevDay = () => {
    setDate(addLocalDays(date, -1));
  };
  const nextDay = () => {
    const next = addLocalDays(date, 1);
    if (next <= argentinaDateString()) setDate(next);
  };

  const downloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `reporte_${date}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    if (!report) return;
    const r = report;
    const esc = (v: any) => `"${String(v || "").replace(/"/g, '""')}"`;

    let csv = "\uFEFF"; // BOM for Excel

    // Sheet 1: Resumen
    csv += "RESUMEN EJECUTIVO\n";
    csv += `Indicador,Valor\n`;
    csv += `Venta Bruta sin Envio,$${r.resumen_ejecutivo.ingresos_brutos.toLocaleString("es-AR")}\n`;
    csv += `Descuentos,$${r.resumen_ejecutivo.descuentos.toLocaleString("es-AR")}\n`;
    csv += `Venta Neta sin Envio,$${r.resumen_ejecutivo.ingresos_netos.toLocaleString("es-AR")}\n`;
    csv += `CMV,$${r.resumen_ejecutivo.cmv.toLocaleString("es-AR")}\n`;
    csv += `Ganancia Bruta,$${r.resumen_ejecutivo.ganancia_bruta.toLocaleString("es-AR")}\n`;
    csv += `Margen Bruto,${r.resumen_ejecutivo.margen_bruto}%\n`;
    csv += `Gastos Operativos,$${r.resumen_ejecutivo.gastos_operativos.toLocaleString("es-AR")}\n`;
    csv += `Ganancia Neta,$${r.resumen_ejecutivo.ganancia_neta.toLocaleString("es-AR")}\n`;
    csv += `Margen Neto,${r.resumen_ejecutivo.margen_neto}%\n\n`;

    // Sheet 2: Ventas
    csv += "VENTAS\n";
    csv += `Total Pedidos,${r.ventas.total_pedidos}\n`;
    csv += `Ticket Promedio,$${r.ventas.ticket_promedio}\n`;
    csv += `Delivery,${r.ventas.delivery}\n`;
    csv += `Takeaway,${r.ventas.takeaway}\n`;
    csv += `Subtotal,$${r.ventas.subtotal}\n`;
    csv += `Envío,$${r.ventas.envio}\n`;
    csv += `Descuentos,$${r.ventas.descuentos}\n`;
    csv += `Venta sin envio,$${r.ventas.total}\n\n`;

    // Sheet 3: Top productos
    csv += "TOP PRODUCTOS\n";
    csv += "Rank,Producto,Unidades,Ingresos\n";
    r.top_productos.forEach((p: any) => {
      csv += `${p.rank},${esc(p.producto)},${p.unidades},${p.ingresos}\n`;
    });
    csv += "\n";

    // Sheet 4: Gastos
    csv += "GASTOS\n";
    csv += `Total,$${r.gastos.total}\n`;
    csv += "Categoría,Monto\n";
    (r.gastos.por_categoria || []).forEach((g: any) => {
      csv += `${esc(g.categoria)},$${g.monto}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `reporte_${date}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const r = report;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Reporte Diario</h1>
          <p className="text-sm text-gray-500 mt-0.5">Resumen ejecutivo de operaciones</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadReport()} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition disabled:opacity-50">
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Actualizar
          </button>
          <button onClick={downloadJSON} className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-gray-300 border border-gray-700 rounded-lg text-xs font-medium hover:bg-gray-800 transition">
            <FileText size={14} /> JSON
          </button>
          <button onClick={downloadExcel} className="flex items-center gap-2 px-3 py-2 bg-emerald-700 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Date navigator */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-center gap-4">
          <button onClick={prevDay} className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm">&larr; Anterior</button>
          <div className="flex items-center gap-3">
            <Calendar size={16} className="text-gray-500" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="border border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-gray-800 text-gray-100 text-center font-semibold" />
          </div>
          <button onClick={nextDay} disabled={date >= argentinaDateString()}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm disabled:opacity-30">Siguiente &rarr;</button>
        </div>
        {r?.rango_operativo && (
          <div className="mt-3 text-center text-xs text-gray-500">
            Rango contado: <span className="font-semibold text-gray-300">{r.rango_operativo.etiqueta}</span>
            {!r.rango_operativo.usa_horarios_sucursal && <span> (sin horarios de sucursal configurados)</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500 flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          Generando reporte...
        </div>
      ) : !r ? (
        <div className="text-center py-20 text-gray-500">No hay datos para esta fecha</div>
      ) : (
        <>
          {/* === ALERTAS === */}
          {r.alerts && r.alerts.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-100">🔔 Alertas del día</span>
                <span className="text-xs text-gray-500">({r.alerts.length})</span>
              </div>
              <div className="divide-y divide-gray-800">
                {r.alerts.map((alert: string, i: number) => (
                  <div key={i} className="px-5 py-2.5 text-sm flex items-center gap-2">
                    <span className="text-base">{alert.split(" ")[0]}</span>
                    <span className="text-gray-300">{alert.replace(/^[^\s]+\s/, "")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === RESUMEN EJECUTIVO === */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2"><Award size={16} className="text-emerald-400" /> Resumen Ejecutivo</h2>
              <span className="text-xs text-gray-500">{r.resumen_ejecutivo.ganancia_neta >= 0 ? "✅" : "⚠️"} Día {r.resumen_ejecutivo.ganancia_neta >= 0 ? "positivo" : "negativo"}</span>
            </div>
            <div className="p-5">
              {/* Main KPI */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KPICard label="Venta Bruta sin Envio" value={`$${r.resumen_ejecutivo.ingresos_brutos.toLocaleString("es-AR")}`} icon={DollarSign} color="text-emerald-400" />
                <KPICard label="Ganancia Bruta" value={`$${r.resumen_ejecutivo.ganancia_bruta.toLocaleString("es-AR")}`} icon={TrendingUp} color={r.resumen_ejecutivo.ganancia_bruta >= 0 ? "text-emerald-400" : "text-red-400"} />
                <KPICard label="Gastos" value={`$${r.resumen_ejecutivo.gastos_operativos.toLocaleString("es-AR")}`} icon={TrendingDown} color="text-red-400" />
                <KPICard label="Ganancia Neta" value={`$${r.resumen_ejecutivo.ganancia_neta.toLocaleString("es-AR")}`} icon={DollarSign} color={r.resumen_ejecutivo.ganancia_neta >= 0 ? "text-emerald-400" : "text-red-400"} />
              </div>

              {/* Margen bar */}
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Margen Bruto</span>
                  <span className={`text-sm font-bold ${r.resumen_ejecutivo.margen_bruto >= 30 ? "text-emerald-400" : r.resumen_ejecutivo.margen_bruto >= 15 ? "text-amber-400" : "text-red-400"}`}>
                    {r.resumen_ejecutivo.margen_bruto}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-gray-900 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${
                    r.resumen_ejecutivo.margen_bruto >= 30 ? "bg-emerald-500" :
                    r.resumen_ejecutivo.margen_bruto >= 15 ? "bg-amber-500" : "bg-red-500"
                  }`} style={{ width: `${Math.min(Math.max(r.resumen_ejecutivo.margen_bruto, 0), 100)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                  <span>0%</span>
                  <span>15%</span>
                  <span>30%</span>
                  <span>50%+</span>
                </div>
              </div>

              {/* Mini income statement */}
              <div className="mt-6 space-y-2 text-sm border border-gray-800 rounded-xl p-4">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Estado de Resultados</p>
                <IncomeRow label="Venta bruta sin envio" value={r.resumen_ejecutivo.ingresos_brutos} />
                <IncomeRow label="Descuentos" value={-r.resumen_ejecutivo.descuentos} indent />
                <IncomeRow label="CMV" value={-r.resumen_ejecutivo.cmv} indent />
                <div className="border-t border-gray-700 pt-1.5 mt-1.5">
                  <IncomeRow label="Ganancia Bruta" value={r.resumen_ejecutivo.ganancia_bruta} bold color={r.resumen_ejecutivo.ganancia_bruta >= 0 ? "text-emerald-400" : "text-red-400"} />
                </div>
                <IncomeRow label="Gastos Operativos" value={-r.resumen_ejecutivo.gastos_operativos} indent />
                <div className="border-t-2 border-gray-600 pt-1.5 mt-1.5">
                  <IncomeRow label="Ganancia / Pérdida Neta" value={r.resumen_ejecutivo.ganancia_neta} bold color={r.resumen_ejecutivo.ganancia_neta >= 0 ? "text-emerald-400" : "text-red-400"} />
                </div>
              </div>
            </div>
          </div>

          {r.owner_profit && (
            <Section title="Rentabilidad Operativa" icon={Calculator} defaultOpen>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                <KPICard label="Ventas Netas" value={`$${r.resumen_ejecutivo.ingresos_netos.toLocaleString("es-AR")}`} icon={DollarSign} color="text-emerald-400" />
                <KPICard label="CMV" value={`$${r.resumen_ejecutivo.cmv.toLocaleString("es-AR")}`} icon={BarChart3} color="text-orange-400" />
                <KPICard label="Costo Laboral" value={`$${r.owner_profit.labor_cost.toLocaleString("es-AR")}`} icon={Users} color="text-blue-400" />
                <KPICard label="Packaging" value={`$${r.owner_profit.packaging_cost.toLocaleString("es-AR")}`} icon={Package} color="text-cyan-400" />
                <KPICard label="Margen Contribucion" value={`$${(r.owner_profit.contribution_margin || 0).toLocaleString("es-AR")}`} icon={TrendingUp} color={(r.owner_profit.contribution_margin || 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
                <KPICard label="% Contribucion" value={`${r.owner_profit.contribution_margin_pct || 0}%`} icon={Percent} color={(r.owner_profit.contribution_margin_pct || 0) >= 25 ? "text-emerald-400" : (r.owner_profit.contribution_margin_pct || 0) >= 20 ? "text-amber-400" : "text-red-400"} />
                <KPICard label="Costos Fijos" value={`$${r.owner_profit.fixed_cost_allocated.toLocaleString("es-AR")}`} icon={Receipt} color="text-purple-400" />
                <KPICard label="Ganancia Operativa" value={`$${r.owner_profit.operating_profit.toLocaleString("es-AR")}`} icon={TrendingUp} color={r.owner_profit.operating_profit >= 0 ? "text-emerald-400" : "text-red-400"} />
                <KPICard label="Ganancia x Pedido" value={`$${r.owner_profit.profit_per_order.toLocaleString("es-AR")}`} icon={ShoppingCart} color={r.owner_profit.profit_per_order >= 0 ? "text-emerald-400" : "text-red-400"} />
                <KPICard label="Margen Operativo" value={`${r.owner_profit.operating_margin}%`} icon={Percent} color={r.owner_profit.operating_margin >= 20 ? "text-emerald-400" : r.owner_profit.operating_margin >= 10 ? "text-amber-400" : "text-red-400"} />
                <KPICard label="Pedidos p/ $100k" value={String(r.owner_profit.orders_needed_for_100k_profit || 0)} icon={ShoppingCart} color="text-blue-400" />
                <KPICard label="Break-even" value={String(r.owner_profit.orders_needed_for_break_even || r.owner_profit.break_even_orders || 0)} icon={Calculator} color="text-purple-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">KPIs de costo</h3>
                  <div className="space-y-2 text-sm">
                    <MetricRow label="Food cost" value={`${r.financial_kpis?.food_cost_pct || 0}%`} />
                    <MetricRow label="Labor cost" value={`${r.financial_kpis?.labor_cost_pct || 0}%`} />
                    <MetricRow label="Packaging" value={`${r.financial_kpis?.packaging_cost_pct || 0}%`} />
                    <MetricRow label="Costos fijos" value={`${r.financial_kpis?.fixed_cost_pct || 0}%`} />
                    <MetricRow label="Margen contribucion" value={`${r.financial_kpis?.contribution_margin_pct || 0}%`} />
                    <MetricRow label="Pedidos para cubrir costos" value={String(r.owner_profit.orders_needed_for_break_even || r.owner_profit.break_even_orders || 0)} />
                    <MetricRow label="Pedidos para $100k" value={String(r.owner_profit.orders_needed_for_100k_profit || 0)} />
                  </div>
                </div>

                <div className="bg-gray-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Insights</h3>
                  <div className="space-y-2">
                    {(r.financial_insights || []).map((insight: string, index: number) => (
                      <p key={index} className="text-sm text-gray-300">{insight}</p>
                    ))}
                    {r.owner_profit.packaging_usage?.length > 0 && (
                      <div className="pt-2 border-t border-gray-700 text-xs text-gray-500">
                        {r.owner_profit.packaging_usage.map((item: any) => (
                          <div key={`${item.name}-${item.type}`} className="flex justify-between">
                            <span>{item.name} x {item.units}</span>
                            <span>${item.cost.toLocaleString("es-AR")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* === VENTAS === */}
          <Section title="Ventas del día" icon={ShoppingCart} defaultOpen>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
              <KPICard label="Total Pedidos" value={r.ventas.total_pedidos.toString()} icon={ShoppingCart} color="text-blue-400" />
              <KPICard label="Venta sin Envio" value={`$${r.ventas.total.toLocaleString("es-AR")}`} icon={DollarSign} color="text-emerald-400" />
              <KPICard label="Envios" value={`$${r.ventas.envio.toLocaleString("es-AR")}`} icon={Truck} color="text-cyan-400" />
              <KPICard label="Ticket Promedio" value={`$${r.ventas.ticket_promedio.toLocaleString("es-AR")}`} icon={DollarSign} color="text-purple-400" />
              <KPICard label="Delivery" value={r.ventas.delivery.toString()} icon={Truck} color="text-purple-400" />
              <KPICard label="Takeaway" value={r.ventas.takeaway.toString()} icon={ShoppingCart} color="text-amber-400" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Hourly breakdown */}
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Clock size={12} /> Ventas por Hora</h3>
                <div className="space-y-1">
                  {r.ventas_por_hora.filter((h: any) => h.pedidos > 0).map((h: any) => {
                    const maxH = Math.max(...r.ventas_por_hora.map((x: any) => x.ingresos), 1);
                    return (
                      <div key={h.hora} className="flex items-center gap-2 text-xs">
                        <span className="w-10 text-gray-500 text-right">{h.hora}</span>
                        <div className="flex-1 h-4 bg-gray-900 rounded overflow-hidden relative">
                          <div className="h-full bg-blue-500/60 rounded" style={{ width: `${(h.ingresos / maxH) * 100}%` }} />
                        </div>
                        <span className="w-14 text-right text-gray-300 tabular-nums">${h.ingresos.toLocaleString("es-AR")}</span>
                        <span className="w-6 text-right text-gray-500 tabular-nums">{h.pedidos}</span>
                      </div>
                    );
                  })}
                  {r.ventas_por_hora.filter((h: any) => h.pedidos > 0).length === 0 && (
                    <p className="text-gray-600 text-xs text-center py-4">Sin ventas</p>
                  )}
                </div>
              </div>

              {/* Payment methods */}
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><PieChart size={12} /> Métodos de Pago</h3>
                <div className="space-y-2">
                  {r.ventas_por_pago.map((pm: any) => {
                    const pct = r.ventas.total_pedidos > 0 ? (pm.pedidos / r.ventas.total_pedidos * 100) : 0;
                    return (
                      <div key={pm.metodo} className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-300">{pm.metodo}</span>
                            <span className="text-gray-400 tabular-nums">${pm.total.toLocaleString("es-AR")}</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Top Products */}
            <div className="mt-4 bg-gray-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Award size={12} /> Top Productos</h3>
              <div className="space-y-1">
                {r.top_productos.slice(0, 10).map((p: any) => {
                  const maxRev = Math.max(...r.top_productos.map((x: any) => x.ingresos), 1);
                  return (
                    <div key={p.rank} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="w-5 text-gray-500 text-right">{p.rank}º</span>
                      <span className="flex-1 text-gray-300 truncate">{p.producto}</span>
                      <div className="w-24 h-3 bg-gray-900 rounded overflow-hidden">
                        <div className="h-full bg-emerald-500/60 rounded" style={{ width: `${(p.ingresos / maxRev) * 100}%` }} />
                      </div>
                      <span className="w-12 text-right text-gray-300 tabular-nums">{p.unidades}u</span>
                      <span className="w-16 text-right text-gray-400 tabular-nums">${p.ingresos.toLocaleString("es-AR")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* === GASTOS === */}
          <Section title="Gastos del día" icon={TrendingDown}>
            {r.gastos.total === 0 ? (
              <div className="text-center py-8 text-gray-600 text-sm">No hay gastos registrados para esta fecha</div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-800 rounded-xl p-4 col-span-2">
                    <div className="space-y-2">
                      {(r.gastos.por_categoria || []).map((g: any) => {
                        const pct = r.gastos.total > 0 ? (g.monto / r.gastos.total * 100) : 0;
                        return (
                          <div key={g.categoria}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-gray-300">{g.categoria}</span>
                              <span className="text-gray-400 tabular-nums">${g.monto.toLocaleString("es-AR")}</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden">
                              <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4 flex flex-col items-center justify-center">
                    <p className="text-3xl font-bold text-red-400 tabular-nums">-${r.gastos.total.toLocaleString("es-AR")}</p>
                    <p className="text-xs text-gray-500 mt-1">Total Gastos</p>
                  </div>
                </div>
              </>
            )}
          </Section>

          {/* === CMV === */}
          <Section title="Costo de Mercancía Vendida (CMV)" icon={BarChart3}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <KPICard label="CMV Total" value={`$${r.resumen_ejecutivo.cmv.toLocaleString("es-AR")}`} icon={DollarSign} color="text-orange-400" />
              <KPICard label="% sobre ingresos" value={`${r.ventas.total > 0 ? ((r.resumen_ejecutivo.cmv / r.ventas.total) * 100).toFixed(1) : "0"}%`} icon={Percent} color="text-orange-400" />
              <KPICard label="CMV x Pedido" value={`$${r.ventas.total_pedidos > 0 ? Math.round(r.resumen_ejecutivo.cmv / r.ventas.total_pedidos).toLocaleString("es-AR") : "0"}`} icon={ShoppingCart} color="text-orange-400" />
              <KPICard label="Costo x Producto" value={`$${r.cmv_detalle.length > 0 ? Math.round(r.cmv_detalle.reduce((s: number, d: any) => s + d.costo, 0) / r.cmv_detalle.length).toLocaleString("es-AR") : "0"}`} icon={BarChart3} color="text-orange-400" />
            </div>
            {r.cmv_detalle.length > 0 && (
              <details className="bg-gray-800 rounded-xl p-4">
                <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-gray-200">
                  Ver detalle ({r.cmv_detalle.filter((d: any) => d.costo > 0).length} con costo · {r.cmv_detalle.filter((d: any) => d.costo === 0).length} sin receta)
                </summary>
                <div className="mt-3 space-y-1 max-h-72 overflow-y-auto">
                  {r.cmv_detalle
                    .filter((d: any) => d.costo > 0)
                    .sort((a: any, b: any) => b.costo - a.costo)
                    .map((d: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-300 truncate">{d.producto}</span>
                      <span className="text-gray-400 tabular-nums flex-shrink-0 ml-2">${d.costo.toLocaleString("es-AR")}</span>
                    </div>
                  ))}
                  {r.cmv_detalle.filter((d: any) => d.costo === 0).length > 0 && (
                    <details className="mt-2 pt-2 border-t border-gray-700">
                      <summary className="text-[10px] text-gray-600 cursor-pointer hover:text-gray-400">
                        {r.cmv_detalle.filter((d: any) => d.costo === 0).length} producto(s) sin receta (costo $0)
                      </summary>
                      <div className="mt-1 space-y-0.5">
                        {r.cmv_detalle.filter((d: any) => d.costo === 0).map((d: any, i: number) => (
                          <div key={i} className="flex justify-between text-[10px] py-0.5">
                            <span className="text-gray-600">{d.producto}</span>
                            <span className="text-gray-700">$0</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </details>
            )}
          </Section>

          {/* === RENTABILIDAD === */}
          <Section title="Rentabilidad" icon={TrendingUp}>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Ingresos Netos</p>
                <p className="text-2xl font-bold text-gray-100 tabular-nums">${r.resumen_ejecutivo.ingresos_netos.toLocaleString("es-AR")}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">CMV</p>
                <p className="text-2xl font-bold text-orange-400 tabular-nums">-${r.resumen_ejecutivo.cmv.toLocaleString("es-AR")}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Gastos</p>
                <p className="text-2xl font-bold text-red-400 tabular-nums">-${r.resumen_ejecutivo.gastos_operativos.toLocaleString("es-AR")}</p>
              </div>
            </div>
            <div className="mt-4 bg-gray-800 rounded-xl p-5 text-center border border-gray-700">
              <p className="text-xs text-gray-500 mb-2">RESULTADO NETO</p>
              <p className={`text-4xl font-bold ${r.resumen_ejecutivo.ganancia_neta >= 0 ? "text-emerald-400" : "text-red-400"} tabular-nums`}>
                {r.resumen_ejecutivo.ganancia_neta >= 0 ? "+" : ""}${r.resumen_ejecutivo.ganancia_neta.toLocaleString("es-AR")}
              </p>
              <p className="text-xs text-gray-500 mt-2">Margen Neto: {r.resumen_ejecutivo.margen_neto}%</p>
              <div className="w-full mt-3 h-3 bg-gray-900 rounded-full overflow-hidden max-w-xs mx-auto">
                <div className={`h-full rounded-full ${r.resumen_ejecutivo.margen_neto >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(Math.abs(r.resumen_ejecutivo.margen_neto), 100)}%` }} />
              </div>
            </div>
          </Section>

          {/* === FINANZAS === */}
          <Section title="Finanzas" icon={DollarSign}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <KPICard label="CMV Total" value={`$${r.finanzas.cmv_total.toLocaleString("es-AR")}`} icon={BarChart3} color="text-orange-400" />
              <KPICard label="Delivery" value={`$${r.finanzas.delivery_costs.toLocaleString("es-AR")}`} icon={Truck} color="text-purple-400" />
              <KPICard label="Marketing" value={`$${r.finanzas.marketing_costs.toLocaleString("es-AR")}`} icon={TrendingUp} color="text-blue-400" />
              <KPICard label="Salarios" value={`$${r.finanzas.salary_costs.toLocaleString("es-AR")}`} icon={DollarSign} color="text-amber-400" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <KPICard label="Costos Fijos" value={`$${r.finanzas.fixed_costs.toLocaleString("es-AR")}`} icon={DollarSign} color="text-gray-400" />
              <KPICard label="Otros Costos" value={`$${r.finanzas.other_costs.toLocaleString("es-AR")}`} icon={DollarSign} color="text-gray-400" />
              <KPICard label="Utilidad Neta Real" value={`$${r.finanzas.net_profit_real.toLocaleString("es-AR")}`} icon={Award} color={r.finanzas.net_profit_real >= 0 ? "text-emerald-400" : "text-red-400"} />
              <KPICard label="Margen Neto Real" value={`${r.finanzas.net_margin_real}%`} icon={Percent} color={r.finanzas.net_margin_real >= 10 ? "text-emerald-400" : "text-red-400"} />
            </div>

            {/* Cost breakdown bar */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Distribución de Costos</h3>
              {(() => {
                const total = r.finanzas.cmv_total + r.finanzas.delivery_costs + r.finanzas.marketing_costs + r.finanzas.salary_costs + r.finanzas.fixed_costs + r.finanzas.other_costs;
                if (total === 0) return <p className="text-gray-600 text-xs text-center py-4">Sin datos de costos</p>;
                const segments = [
                  { label: "CMV", value: r.finanzas.cmv_total, color: "bg-orange-500" },
                  { label: "Delivery", value: r.finanzas.delivery_costs, color: "bg-purple-500" },
                  { label: "Marketing", value: r.finanzas.marketing_costs, color: "bg-blue-500" },
                  { label: "Salarios", value: r.finanzas.salary_costs, color: "bg-amber-500" },
                  { label: "Fijos", value: r.finanzas.fixed_costs, color: "bg-gray-500" },
                  { label: "Otros", value: r.finanzas.other_costs, color: "bg-slate-500" },
                ].filter((s) => s.value > 0);
                return (
                  <div>
                    <div className="w-full h-4 bg-gray-900 rounded-full overflow-hidden flex">
                      {segments.map((s) => (
                        <div key={s.label} className={s.color} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3">
                      {segments.map((s) => (
                        <span key={s.label} className="flex items-center gap-1.5 text-xs text-gray-400">
                          <span className={`w-2 h-2 rounded-full ${s.color.replace("bg-", "bg-").replace("-500", "-500")}`} />
                          {s.label} ({((s.value / total) * 100).toFixed(0)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </Section>

          {/* === CASHFLOW === */}
          <Section title="Cashflow" icon={DollarSign}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <KPICard label="Venta Cobrada sin Envio" value={`$${r.cashflow.cash_in.toLocaleString("es-AR")}`} icon={TrendingUp} color="text-emerald-400" />
              <KPICard label="Egresos (Cash Out)" value={`-$${r.cashflow.cash_out.toLocaleString("es-AR")}`} icon={TrendingDown} color="text-red-400" />
              <KPICard label="Saldo del día" value={`$${r.cashflow.current_cash.toLocaleString("es-AR")}`} icon={DollarSign} color={r.cashflow.current_cash >= 0 ? "text-emerald-400" : "text-red-400"} />
              <KPICard label="Proyectado 7d" value={`$${r.cashflow.projected_7d.toLocaleString("es-AR")}`} icon={Calendar} color="text-blue-400" />
            </div>
            <div className="bg-gray-800 rounded-xl p-5 text-center border border-gray-700">
              <p className="text-xs text-gray-500 mb-2">FLUJO DE CAJA DEL DÍA</p>
              <div className="flex items-center justify-center gap-8 text-sm">
                <div>
                  <p className="text-gray-400">Entrada</p>
                  <p className="text-xl font-bold text-emerald-400 tabular-nums">+${r.cashflow.cash_in.toLocaleString("es-AR")}</p>
                </div>
                <div className="text-2xl text-gray-600">→</div>
                <div>
                  <p className="text-gray-400">Salida</p>
                  <p className="text-xl font-bold text-red-400 tabular-nums">-${r.cashflow.cash_out.toLocaleString("es-AR")}</p>
                </div>
                <div className="text-2xl text-gray-600">=</div>
                <div>
                  <p className="text-gray-400">Saldo</p>
                  <p className={`text-xl font-bold tabular-nums ${r.cashflow.current_cash >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {r.cashflow.current_cash >= 0 ? "+" : ""}${r.cashflow.current_cash.toLocaleString("es-AR")}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Venta promedio diaria (7d): <strong className="text-gray-300">${r.cashflow.avg_daily_sales.toLocaleString("es-AR")}</strong></span>
                  <span>Proyectado 7 días: <strong className="text-blue-400">${r.cashflow.projected_7d.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function KPICard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} className={color} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color} tabular-nums`}>{value}</p>
    </div>
  );
}

function IncomeRow({ label, value, indent, bold, color }: { label: string; value: number; indent?: boolean; bold?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between ${indent ? "ml-4" : ""}`}>
      <span className={`text-gray-400 ${bold ? "font-semibold" : ""}`}>{label}</span>
      <span className={`${color || (value >= 0 ? "text-gray-100" : "text-red-400")} tabular-nums font-medium`}>
        {value >= 0 ? "$" : "-$"}{Math.abs(value).toLocaleString("es-AR")}
      </span>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-700/60 pb-1 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold tabular-nums text-gray-100">{value}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen }: { title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      <summary className="px-5 py-4 border-b border-gray-700 text-sm font-semibold text-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 transition">
        <Icon size={16} className="text-gray-400" /> {title}
      </summary>
      <div className="p-5">
        {children}
      </div>
    </details>
  );
}
