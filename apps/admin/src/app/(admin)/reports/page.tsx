"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { DollarSign, ShoppingCart, TrendingUp, Calendar } from "lucide-react";

export default function ReportsPage() {
  const [period, setPeriod] = useState("today");
  const [orders, setOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [period]);

  const getDateFilter = () => {
    const now = new Date();
    const start = new Date(now);
    if (period === "today") start.setHours(0, 0, 0, 0);
    else if (period === "week") start.setDate(now.getDate() - now.getDay());
    else if (period === "month") start.setDate(1);
    else if (period === "custom") return null;
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  };

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) { setLoading(false); return; }

    const dateFilter = getDateFilter();
    const query = supabase.from("orders").select("*").eq("tenant_id", r.tenant_id).in("status", ["delivered", "sent", "ready"]);
    const expQuery = supabase.from("expenses").select("*").eq("tenant_id", r.tenant_id);

    if (dateFilter) {
      query.gte("created_at", dateFilter);
      expQuery.gte("expense_date", dateFilter.split("T")[0]);
    }

    const [{ data: o }, { data: e }] = await Promise.all([query.order("created_at", { ascending: false }), expQuery.order("expense_date", { ascending: false })]);
    setOrders(o || []); setExpenses(e || []);
    setLoading(false);
  };

  const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.total), 0);
  const orderCount = orders.length;
  const avgTicket = orderCount > 0 ? totalSales / orderCount : 0;

  const stats = [
    { label: "Ventas", value: `$${totalSales.toLocaleString("es-AR")}`, icon: DollarSign, color: "text-emerald-400" },
    { label: "Gastos", value: `-$${totalExpenses.toLocaleString("es-AR")}`, icon: TrendingUp, color: "text-red-400" },
    { label: "Ganancia neta", value: `$${(totalSales - totalExpenses).toLocaleString("es-AR")}`, icon: DollarSign, color: totalSales - totalExpenses >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "Pedidos", value: orderCount.toString(), icon: ShoppingCart, color: "text-blue-400" },
    { label: "Ticket promedio", value: `$${avgTicket.toLocaleString("es-AR")}`, icon: Calendar, color: "text-purple-400" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Reportes de Ventas</h1>
        <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1">
          {["today", "week", "month"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${period === p ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              {p === "today" ? "Hoy" : p === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-gray-400">{s.label}</span>
            </div>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Cargando...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-100">Pedidos recientes</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {orders.slice(0, 20).map((order) => (
              <div key={order.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/50">
                <div>
                  <p className="text-sm font-medium text-gray-100">#{order.id.slice(-6).toUpperCase()} · {order.customer_name || "Anónimo"}</p>
                  <p className="text-xs text-gray-500">{order.type} · {new Date(order.created_at).toLocaleString()}</p>
                </div>
                <span className="text-sm font-semibold text-gray-100">${Number(order.total).toLocaleString("es-AR")}</span>
              </div>
            ))}
            {orders.length === 0 && <p className="text-center py-8 text-gray-500 text-sm">Sin pedidos en este período</p>}
          </div>
        </div>
      )}
    </div>
  );
}
