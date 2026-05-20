"use client";
import { useEffect, useState, useMemo } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Search, Calendar, Filter, X, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function VentasProductosPage() {
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"qty" | "revenue">("revenue");

  const tenantIdRef = useMemo(() => ({ current: "" }), []);

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [dateFrom, dateTo, typeFilter, categoryFilter, statusFilter]);

  const loadMeta = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    tenantIdRef.current = r.tenant_id;

    const { data: c } = await supabase.from("categories").select("*").eq("tenant_id", r.tenant_id).order("name");
    setCategories(c || []);
  };

  const load = async () => {
    setLoading(true);
    const tenantId = tenantIdRef.current;
    if (!tenantId) { setLoading(false); return; }

    // First get order IDs in the date range
    let orderQuery = supabase.from("orders")
      .select("id, type, status, total")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${dateFrom}T00:00:00`)
      .lte("created_at", `${dateTo}T23:59:59`);

    if (typeFilter) orderQuery = orderQuery.eq("type", typeFilter);
    if (statusFilter) orderQuery = orderQuery.eq("status", statusFilter);

    const { data: orders } = await orderQuery;
    if (!orders || orders.length === 0) {
      setOrderItems([]); setTotalRevenue(0); setLoading(false);
      return;
    }

    const orderIds = orders.map((o) => o.id);
    setTotalRevenue(orders.reduce((s, o) => s + Number(o.total), 0));

    // Get order_items for those orders, with products
    let itemsQuery = supabase.from("order_items")
      .select("*, products(name, category_id)")
      .in("order_id", orderIds);

    if (categoryFilter) {
      itemsQuery = itemsQuery.eq("products.category_id", categoryFilter);
      // Also try subcategories: products whose category's parent_id matches
    }

    const { data: items } = await itemsQuery;
    setOrderItems(items || []);
    setLoading(false);
  };

  const catNameMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);

  // Aggregate by product
  const productMap = useMemo(() => {
    const map: Record<string, { name: string; category: string; qty: number; revenue: number; orders: Set<string> }> = {};
    orderItems.forEach((item) => {
      const pid = item.product_id;
      if (!map[pid]) {
        map[pid] = {
          name: item.products?.name || "Producto",
          category: catNameMap[item.products?.category_id] || "",
          qty: 0, revenue: 0, orders: new Set(),
        };
      }
      map[pid].qty += item.quantity || 1;
      map[pid].revenue += Number(item.total) || 0;
      map[pid].orders.add(item.order_id);
    });
    return Object.entries(map)
      .map(([id, data]) => ({ id, ...data, ordersCount: data.orders.size }))
      .filter((p) => search ? p.name.toLowerCase().includes(search.toLowerCase()) : true);
  }, [orderItems, search]);

  const sortedProducts = useMemo(() => {
    return [...productMap].sort((a, b) => sortBy === "qty" ? b.qty - a.qty : b.revenue - a.revenue);
  }, [productMap, sortBy]);

  const totalQty = productMap.reduce((s, p) => s + p.qty, 0);
  const topProduct = sortedProducts[0];
  const uniqueProducts = productMap.length;

  const hasActiveFilters = typeFilter || categoryFilter || statusFilter || search;

  const resetFilters = () => {
    const d = new Date(); d.setDate(1);
    setDateFrom(d.toISOString().split("T")[0]);
    setDateTo(new Date().toISOString().split("T")[0]);
    setTypeFilter(""); setCategoryFilter(""); setStatusFilter(""); setSearch("");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Ventas por Producto</h1>
          <p className="text-sm text-gray-500 mt-0.5">{uniqueProducts} productos · {totalQty} unidades vendidas</p>
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition border ${
            showFilters || hasActiveFilters ? "bg-blue-600/20 text-blue-300 border-blue-600/30" : "bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800"
          }`}>
          <Filter size={14} /> Filtros {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-blue-400" />}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Ingreso total", value: `$${totalRevenue.toLocaleString("es-AR")}`, color: "text-emerald-400" },
          { label: "Unidades vendidas", value: totalQty.toLocaleString("es-AR"), color: "text-blue-400" },
          { label: "Productos distintos", value: uniqueProducts.toString(), color: "text-purple-400" },
          { label: "Ticket promedio", value: `$${(totalRevenue / (totalQty || 1)).toLocaleString("es-AR")}`, color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
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
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-gray-800 text-gray-100" />
            <span className="text-gray-500">→</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-gray-800 text-gray-100" />
            {["today", "week", "month"].map((p) => {
              const setPreset = () => {
                const now = new Date();
                if (p === "today") { setDateFrom(now.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); }
                else if (p === "week") { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); setDateFrom(d.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); }
                else { const d = new Date(now); d.setDate(1); setDateFrom(d.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); }
              };
              return <button key={p} onClick={setPreset} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-gray-200">{p === "today" ? "Hoy" : p === "week" ? "Semana" : "Mes"}</button>;
            })}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Tipo de pedido</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                <option value="">Todos</option>
                <option value="delivery">Delivery</option>
                <option value="takeaway">Takeaway</option>
                <option value="pedidosya">PedidosYa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Categoría</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                <option value="">Todas</option>
                {categories.filter((c) => !c.parent_id).map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name} (todas)</option>
                    {categories.filter((s) => s.parent_id === c.id).map((s) => (
                      <option key={s.id} value={s.id}>└ {s.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Estado</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                <option value="">Todos</option>
                <option value="delivered">Entregados</option>
                <option value="sent">Enviados</option>
                <option value="ready">Listos</option>
                <option value="confirmed">Confirmados</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Buscar producto</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-gray-600 rounded-lg pl-8 pr-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500"
                  placeholder="Nombre..." />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Product Highlight */}
      {topProduct && !search && (
        <div className="bg-gradient-to-r from-emerald-900/30 to-blue-900/30 border border-emerald-700/30 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Producto más vendido</p>
              <p className="text-lg font-bold text-gray-100 mt-1">{topProduct.name}</p>
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span className="text-gray-300"><strong className="text-emerald-400">{topProduct.qty}</strong> unidades</span>
                <span className="text-gray-300"><strong className="text-emerald-400">${topProduct.revenue.toLocaleString("es-AR")}</strong> en ventas</span>
                <span className="text-gray-300"><strong className="text-gray-400">{topProduct.ordersCount}</strong> pedidos</span>
              </div>
            </div>
            <div className="text-4xl">🏆</div>
          </div>
        </div>
      )}

      {/* Sort toggle */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Ordenar por:</span>
        <button onClick={() => setSortBy("revenue")}
          className={`px-3 py-1 text-xs rounded-full font-medium transition ${sortBy === "revenue" ? "bg-gray-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
          Ingreso
        </button>
        <button onClick={() => setSortBy("qty")}
          className={`px-3 py-1 text-xs rounded-full font-medium transition ${sortBy === "qty" ? "bg-gray-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
          Cantidad
        </button>
      </div>

      {/* Product ranking table */}
      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Cargando...</div>
      ) : sortedProducts.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">No hay ventas en este período</div>
      ) : (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-700 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-1">#</div>
            <div className="col-span-4">Producto</div>
            <div className="col-span-2 text-right">Unidades</div>
            <div className="col-span-1 text-right">%</div>
            <div className="col-span-2 text-right">Ingreso</div>
            <div className="col-span-1 text-right">%</div>
            <div className="col-span-1 text-right">Pedidos</div>
          </div>
          <div className="divide-y divide-gray-800">
            {sortedProducts.map((product, idx) => {
              const qtyPct = totalQty > 0 ? (product.qty / totalQty * 100) : 0;
              const revPct = totalRevenue > 0 ? (product.revenue / totalRevenue * 100) : 0;
              const barColor = idx === 0 ? "bg-emerald-500" : idx < 5 ? "bg-blue-500" : "bg-gray-600";
              return (
                <div key={product.id} className="px-4 py-3 hover:bg-gray-800/30 transition">
                  <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1">
                      {idx === 0 ? <span className="text-emerald-400 font-bold">🥇</span> :
                       idx === 1 ? <span className="text-gray-300 font-bold">🥈</span> :
                       idx === 2 ? <span className="text-amber-600 font-bold">🥉</span> :
                       <span className="text-gray-600 text-sm">{idx + 1}</span>}
                    </div>
                    <div className="col-span-4">
                      <p className="text-sm font-medium text-gray-100 truncate">{product.name}</p>
                      {product.category && <p className="text-[10px] text-gray-500">{product.category}</p>}
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(qtyPct, 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-100 tabular-nums">{product.qty}</span>
                      </div>
                    </div>
                    <div className="col-span-1 text-right text-xs text-gray-500 tabular-nums">{qtyPct.toFixed(1)}%</div>
                    <div className="col-span-2 text-right text-sm font-semibold text-gray-100 tabular-nums">
                      ${product.revenue.toLocaleString("es-AR")}
                    </div>
                    <div className="col-span-1 text-right text-xs text-gray-500 tabular-nums">{revPct.toFixed(1)}%</div>
                    <div className="col-span-1 text-right text-xs text-gray-400 tabular-nums">{product.ordersCount}</div>
                  </div>
                  {/* Mobile view */}
                  <div className="md:hidden space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-100 truncate flex-1">{product.name}</span>
                      <span className="text-sm font-semibold text-gray-100 tabular-nums ml-2">${product.revenue.toLocaleString("es-AR")}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{product.qty} unid. · {product.ordersCount} pedidos</span>
                      <div className="flex items-center gap-1">
                        {idx === 0 ? <TrendingUp size={12} className="text-emerald-400" /> :
                         idx < 5 ? <TrendingUp size={12} className="text-blue-400" /> :
                         <Minus size={12} className="text-gray-600" />}
                        <span>{qtyPct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
