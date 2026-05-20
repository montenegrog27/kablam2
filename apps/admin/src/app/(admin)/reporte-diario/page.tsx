"use client";
import { useEffect, useState, useCallback } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  Download, Calendar, FileText, TrendingUp, TrendingDown,
  DollarSign, ShoppingCart, Truck, Percent, Clock, Award,
  PieChart, BarChart3, ChevronDown, ChevronUp, Printer,
} from "lucide-react";

export default function ReporteDiarioPage() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() - 86400000);
    return d.toISOString().split("T")[0];
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
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split("T")[0]);
  };
  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    if (d <= new Date()) setDate(d.toISOString().split("T")[0]);
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
    csv += `Ingresos Brutos,$${r.resumen_ejecutivo.ingresos_brutos.toLocaleString("es-AR")}\n`;
    csv += `Descuentos,$${r.resumen_ejecutivo.descuentos.toLocaleString("es-AR")}\n`;
    csv += `Ingresos Netos,$${r.resumen_ejecutivo.ingresos_netos.toLocaleString("es-AR")}\n`;
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
    csv += `Total,$${r.ventas.total}\n\n`;

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
          <button onClick={nextDay} disabled={date >= new Date().toISOString().split("T")[0]}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm disabled:opacity-30">Siguiente &rarr;</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Generando reporte...</div>
      ) : !r ? (
        <div className="text-center py-20 text-gray-500">No hay datos para esta fecha</div>
      ) : (
        <>
          {/* === RESUMEN EJECUTIVO === */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2"><Award size={16} className="text-emerald-400" /> Resumen Ejecutivo</h2>
              <span className="text-xs text-gray-500">{r.resumen_ejecutivo.ganancia_neta >= 0 ? "✅" : "⚠️"} Día {r.resumen_ejecutivo.ganancia_neta >= 0 ? "positivo" : "negativo"}</span>
            </div>
            <div className="p-5">
              {/* Main KPI */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KPICard label="Ingresos Brutos" value={`$${r.resumen_ejecutivo.ingresos_brutos.toLocaleString("es-AR")}`} icon={DollarSign} color="text-emerald-400" />
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
                <IncomeRow label="Ingresos Brutos" value={r.resumen_ejecutivo.ingresos_brutos} />
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

          {/* === VENTAS === */}
          <Section title="Ventas del día" icon={ShoppingCart} defaultOpen>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KPICard label="Total Pedidos" value={r.ventas.total_pedidos.toString()} icon={ShoppingCart} color="text-blue-400" />
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
                <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-gray-200">Ver detalle por producto ({r.cmv_detalle.length} items)</summary>
                <div className="mt-3 space-y-1 max-h-60 overflow-y-auto">
                  {r.cmv_detalle.map((d: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-300">{d.producto}</span>
                      <span className="text-gray-400 tabular-nums">${d.costo.toLocaleString("es-AR")}</span>
                    </div>
                  ))}
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
